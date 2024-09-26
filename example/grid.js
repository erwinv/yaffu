import { range, take } from 'es-toolkit'
import { ffconcatDemux, genericCombine } from 'yaffu'
import { file, maybeDownloadInputFile } from './index.js'
import { unlinkNoThrow } from './util.js'

await maybeDownloadInputFile()

const N = 16
const duration = 2000

const startTimestamps = range(N).map((i) => i * N * duration)
const outputs = range(1, N + 1).map((i) => `grid_${i}.mp4`)

for (const [i, n] of range(1, N + 1).entries()) {
  const inputs = take(startTimestamps, n)
    .map((start) => [
      `-ss ${(start + i * duration) / 1000}`,
      `-t ${duration / 1000}`,
    ])
    .map((opts) => ({ path: file, opts }))

  await genericCombine(inputs, outputs[i], '1080p')
}

try {
  await ffconcatDemux(outputs, 'grid_layout.mp4', false)
} finally {
  await Promise.all(outputs.map(unlinkNoThrow))
}
