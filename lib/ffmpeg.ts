import { Console } from 'console'
import { spawn } from 'child_process'
import { writeFile } from 'fs/promises'
import { basename, dirname, extname, join, resolve } from 'path'
import { Readable } from 'stream'
import { unlinkNoThrow } from './util.js'
import { FilterGraph } from './graph.js'

const console = new Console(process.stderr)

export class FFmpegError extends Error {
  constructor(public exitCode: number) {
    super(`FFmpeg exited with failure code: ${exitCode}`)
  }
}

export interface VideoStreamMetadata {
  codec_type: 'video'
  width: number
  height: number
  pix_fmt: string
  start_time: string
  duration: string
  bit_rate: string
}
export interface AudioStreamMetadata {
  codec_type: 'audio'
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
    { shell: true, stdio: ['ignore', 'pipe', 'inherit'] }
  )

  return new Promise<ContainerMetadata>((resolve, reject) => {
    const out = [] as string[]
    ffprobe.stdout.on('data', (chunk: Buffer) =>
      out.push(chunk.toString('utf8'))
    )
    ffprobe.on('error', reject)
    ffprobe.on('close', (code) => {
      if (code !== 0) reject()
      else resolve(JSON.parse(out.join('')))
    })
  })
}

export async function concatDemux(clipPaths: string[], outputPath: string) {
  const concatListPath = join(
    dirname(outputPath),
    basename(outputPath, extname(outputPath)) + '_concatList.txt' // TODO FIXME use os.tmpdir()
  )

  await writeFile(
    concatListPath,
    clipPaths.map((clipPath) => `file ${resolve(clipPath)}`).join('\n')
  )

  const ffmpeg = spawn(
    'ffmpeg',
    [
      '-v warning',
      ...(outputPath.endsWith('.mp4') ? ['-auto_convert 1'] : []),
      '-f concat',
      '-safe 0',
      `-i ${concatListPath}`,
      '-c copy',
      '-y',
      outputPath,
    ],
    { shell: true, stdio: ['ignore', process.stderr, 'inherit'] }
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

export async function mux(graph: FilterGraph, verbose = true) {
  if (graph.outputs.size === 0) throw new Error('No defined output/s')

  const inputs = graph.inputs
  const outputs = [...graph.outputs.entries()]

  if (verbose) {
    console.dir(inputs.map((input) => input.path))
    console.dir([...graph.outputs.keys()])
    console.dir(graph.pipes.map((p) => p.serialize()))
  }

  const ffmpeg = spawn(
    'ffmpeg',
    [
      verbose ? '-hide_banner' : '-v warning',
      ...inputs.flatMap((input) => [
        ...(input.opts ?? []),
        `-i "${input.path}"`,
      ]),
      '-filter_complex_script pipe:',
      ...outputs.flatMap(([outputPath, streams]) => [
        ...streams.map((stream) => stream.serialize()),
        '-y',
        outputPath,
      ]),
    ],
    {
      shell: true,
      stdio: ['pipe', process.stderr, 'inherit'],
    }
  )

  try {
    await new Promise<void>((resolve, reject) => {
      ffmpeg.on('error', reject)
      ffmpeg.on('close', (code) => {
        if (code !== 0) reject(new FFmpegError(code ?? NaN))
        else resolve()
      })

      Readable.from(graph.serialize()).pipe(ffmpeg.stdin)
    })
  } catch (e) {
    await Promise.all(outputs.map(([outputPath]) => unlinkNoThrow(outputPath)))
    throw e
  }
}
