import { strict as assert } from 'node:assert'
import { spawn } from 'node:child_process'
import { Console } from 'node:console'
import { writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, extname, join, resolve } from 'node:path'
import { Readable } from 'node:stream'
import { Codec, ENCODER } from './codec.js'
import { FilterGraph } from './graph.js'
import { unlinkNoThrow } from './util.js'

const console = new Console(process.stderr)

export class FFmpegError extends Error {
  constructor(public exitCode: number) {
    super(`FFmpeg exited with failure code: ${exitCode}`)
  }
}

export interface VideoStreamMetadata {
  codec_type: 'video'
  codec_name: string // TODO enum?
  width: number
  height: number
  pix_fmt: string
  start_time: string
  duration: string
  bit_rate: string
}
export interface AudioStreamMetadata {
  codec_type: 'audio'
  codec_name: string // TODO enum?
  sample_rate: string
  channels: number
  start_time: string
  duration: string
  bit_rate: string
}

export interface ContainerMetadata {
  streams: Array<VideoStreamMetadata | AudioStreamMetadata>
  format: {
    start_time: string
    duration: string
    nb_streams: number
  }
}

export async function probe(path: string) {
  const ffprobe = spawn(
    'ffprobe',
    [
      '-v error',
      '-print_format json=compact=1',
      '-show_format',
      '-show_streams',
      `"${path}"`,
    ],
    { shell: true, stdio: ['ignore', 'pipe', 'inherit'] },
  )

  return new Promise<ContainerMetadata>((resolve, reject) => {
    const out = [] as string[]
    ffprobe.stdout.on('data', (chunk: Buffer) =>
      out.push(chunk.toString('utf8')),
    )
    ffprobe.on('error', reject)
    ffprobe.on('close', (code) => {
      if (code !== 0) reject()
      else resolve(JSON.parse(out.join('')))
    })
  })
}

export async function concatDemux(
  clipPaths: string[],
  outputPath: string,
  verbose = true,
) {
  const concatListPath = join(
    tmpdir(),
    basename(outputPath, extname(outputPath)) + '_concatList.txt',
  )

  const files = clipPaths.map((clipPath) => `file ${resolve(clipPath)}`)
  console.dir(files)
  await writeFile(concatListPath, files.join('\n'))

  const ffmpeg = spawn(
    'ffmpeg',
    [
      verbose ? '-hide_banner' : '-v error',
      ...(outputPath.endsWith('.mp4') ? ['-auto_convert 1'] : []),
      '-f concat',
      '-safe 0',
      `-i ${concatListPath}`,
      '-c copy',
      '-y',
      outputPath,
    ],
    { shell: true, stdio: ['ignore', process.stderr, 'inherit'] },
  )

  try {
    await new Promise<void>((resolve, reject) => {
      ffmpeg.on('error', reject)
      ffmpeg.on('close', (code) => {
        if (code !== 0) reject(new FFmpegError(code ?? NaN))
        else resolve()
      })
    })
    return outputPath
  } catch (e) {
    await unlinkNoThrow(outputPath)
    throw e
  } finally {
    await unlinkNoThrow(concatListPath)
  }
}

export async function mux(
  graph: FilterGraph,
  verbose = true,
  bestEffort = false,
) {
  if (graph.outputs.size === 0) throw new Error('No defined output/s')

  const inputs = graph.inputs
  const outputs = [...graph.outputs.entries()]

  console.table(inputs)
  for (const [path, streams] of outputs) {
    console.info(path)
    console.table(streams)
  }
  console.dir(graph.pipes.map((p) => p.serialize()))

  const ffmpeg = spawn(
    'ffmpeg',
    [
      verbose ? '-hide_banner' : '-v warning',
      ...inputs.flatMap((input) => [
        ...(input.opts ?? []),
        `-i "${input.path}"`,
      ]),
      '-/filter_complex pipe:',
      ...outputs.flatMap(([outputPath, streams]) => [
        ...streams.map((stream) => stream.serialize()),
        '-y',
        outputPath,
      ]),
    ],
    {
      shell: true,
      stdio: ['pipe', process.stderr, 'inherit'],
    },
  )

  try {
    await new Promise<void>((resolve, reject) => {
      const ignoreError = bestEffort // continue even if FFmpeg complains about corrupted inputs
      const errorHandler = ignoreError ? console.error : reject

      ffmpeg.on('error', errorHandler)
      ffmpeg.on('close', (code) => {
        if (code !== 0) {
          errorHandler(new FFmpegError(code ?? NaN))
          if (bestEffort) resolve()
        } else resolve()
      })

      Readable.from(graph.serialize()).pipe(ffmpeg.stdin)
    })
  } catch (e) {
    await Promise.all(outputs.map(([outputPath]) => unlinkNoThrow(outputPath)))
    throw e
  }
}

export async function mergeAV(
  audio: string,
  video: string,
  output: string,
  verbose = true,
) {
  const ext = extname(output)
  assert(
    ['.mp4', '.webm'].includes(ext),
    `Unsupported output format (must be .mp4 or .webm): ${ext}`,
  )

  const targetAudioCodec: Codec = ext === '.mp4' ? 'aac' : 'opus'
  const targetVideoCodec: Codec = ext === '.mp4' ? 'h264' : 'vp9'

  const inputAudioMeta = await probe(audio)
  assert(
    inputAudioMeta.streams[0].codec_type === 'audio',
    `Not an audio file: ${audio}`,
  )
  const inputAudioCodec = inputAudioMeta.streams[0].codec_name

  const inputVideoMeta = await probe(video)
  assert(
    inputVideoMeta.streams[0].codec_type === 'video',
    `Not a video file: ${video}`,
  )
  const inputVideoCodec = inputVideoMeta.streams[0].codec_name

  const codecOpts: string[] = []
  const shouldTranscodeAudio = inputAudioCodec !== targetAudioCodec
  const shouldTranscodeVideo = inputVideoCodec !== targetVideoCodec
  if (!shouldTranscodeAudio && !shouldTranscodeVideo) codecOpts.push('-c copy')
  else {
    codecOpts.push(
      `-c:a ${shouldTranscodeAudio ? ENCODER[targetAudioCodec] : 'copy'}`,
    )
    codecOpts.push(
      `-c:v ${shouldTranscodeVideo ? ENCODER[targetVideoCodec] : 'copy'}`,
    )
  }

  const ffmpeg = spawn(
    'ffmpeg',
    [
      verbose ? '-hide_banner' : '-v error',
      `-i ${audio}`,
      `-i ${video}`,
      ...codecOpts,
      '-y',
      output,
    ],
    { shell: true, stdio: ['ignore', process.stderr, 'inherit'] },
  )

  try {
    await new Promise<void>((resolve, reject) => {
      ffmpeg.on('error', reject)
      ffmpeg.on('close', (code) => {
        if (code !== 0) reject(new FFmpegError(code ?? NaN))
        else resolve()
      })
    })
    return output
  } catch (e) {
    await unlinkNoThrow(output)
    throw e
  }
}
