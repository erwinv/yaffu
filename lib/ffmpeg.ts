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

export async function probe(path: string, entry: string) {
  const ffprobe = spawn(
    'ffprobe',
    [
      '-v error',
      `-show_entries ${entry}`,
      '-of default=noprint_wrappers=1:nokey=1',
      `"${path}"`,
    ],
    { shell: true, stdio: ['ignore', 'pipe', 'inherit'] }
  )

  return new Promise<string>((resolve, reject) => {
    const out = [] as string[]
    ffprobe.stdout.on('data', (chunk: Buffer) =>
      out.push(chunk.toString('utf8'))
    )
    ffprobe.on('error', reject)
    ffprobe.on('close', (code) => {
      if (code !== 0) reject()
      else resolve(out.join('\n'))
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
    console.dir(inputs.map(([inputPath]) => inputPath))
    console.dir([...graph.outputs.keys()])
    console.dir(graph.pipes.map((p) => p.serialize()))
  }

  const ffmpeg = spawn(
    'ffmpeg',
    [
      verbose ? '-hide_banner' : '-v warning',
      ...inputs.flatMap(([inputPath, inputOpts]) => [
        ...inputOpts,
        `-i "${inputPath}"`,
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
