import { range, take } from 'lodash-es'
import {
  FilterGraph,
  compositePresentation,
  mixAudio,
  ffmux,
  ffconcatDemux,
} from 'yaffu'
import { file, maybeDownloadInputFile } from './index.mjs'
import { unlinkNoThrow } from './util.mjs'

await maybeDownloadInputFile()

const N = 5
const duration = 10000

const startTimestamps = range(N).map((i) => i * N * duration)
const outputs = range(1, N + 1).map((i) => `presentation_${i}.mp4`)

for (const [i, n] of range(1, N + 1).entries()) {
  const inputs = take(startTimestamps, n)
    .map((start) => [
      `-ss ${(start + i * duration) / 1000}`,
      `-t ${duration / 1000}`,
    ])
    .map((opts) => ({ path: file, opts }))

  const graph = await new FilterGraph(inputs).init()
  const [main, ...others] = graph.leafVideoStreams

  graph
    .pipeEach(others, (id) => `${id}:cam`)
    .buildEach((pipe, i) => {
      pipe.filter('drawtext', [], {
        text: `Participant #${i + 1}`,
        x: 24,
        y: 'h-text_h-12',
        fontcolor: 'white',
        fontsize: 60,
      })
    })

  compositePresentation(graph, ['vout'], main, '720p')
  mixAudio(graph, ['aout'])
  graph.map(['vout', 'aout'], outputs[i], '720p')

  await ffmux(graph, false)
}

try {
  await ffconcatDemux(outputs, 'presentation_layout.mp4', false)
} finally {
  await Promise.all(outputs.map(unlinkNoThrow))
}
