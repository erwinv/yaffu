import { range, take } from 'lodash-es'
import { constants } from 'fs'
import { access } from 'fs/promises'
import {
  ffmux,
  ffconcatDemux,
  FilterGraph,
  genericCombine,
  mixAudio,
  compositePresentation,
  renderParticipantTrack,
} from 'yaffu'
import { downloadFile } from './util.mjs'

const file = 'BigBuckBunny-720p.mp4'
const fileHost = new URL('https://erwinvcc.ap-south-1.linodeobjects.com')
const fileDownloadLink = new URL(file, fileHost)

async function maybeDownloadInputFile() {
  try {
    await access(file, constants.R_OK)
  } catch {
    console.error('Downloading', fileDownloadLink.href)
    await downloadFile(fileDownloadLink, './')
  }
}

async function gridLayout() {
  await maybeDownloadInputFile()

  const N = 16
  const duration = 2

  const startTimestamps = range(N).map((i) => i * N * duration)
  const outputs = range(1, N + 1).map((i) => `grid_${i}.mp4`)

  for (const [i, n] of range(1, N + 1).entries()) {
    const inputs = take(startTimestamps, n)
      .map(start => [`-ss ${start + i * duration}`, `-t ${duration}`])
      .map((opts) => [file, opts])

    await ffmux(genericCombine(inputs, outputs[i]))
  }

  await ffconcatDemux(outputs, 'grid_layout.mp4')
}

async function presentationLayout() {
  await maybeDownloadInputFile()

  const N = 5
  const duration = 10

  const startTimestamps = range(N).map((i) => i * N * duration)
  const outputs = range(1, N + 1).map((i) => `presentation_${i}.mp4`)

  for (const [i, n] of range(1, N + 1).entries()) {
    const inputs = take(startTimestamps, n)
      .map((start) => [`-ss ${start + i * duration}`, `-t ${duration}`])
      .map((opt) => [file, opt])

    const graph = new FilterGraph(inputs)

    compositePresentation(graph, ['vout'])
    mixAudio(graph, ['aout'])
    graph.map(['vout', 'aout'], outputs[i])

    await ffmux(graph)
  }

  await ffconcatDemux(outputs, 'presentation_layout.mp4')
}

async function participantTrack() {
  {
    // no clips, just thumbnail
    const graph = new FilterGraph([])
    renderParticipantTrack(graph, 'vout', {
      participant: { id: '0', name: 'Big Buck Bunny' },
      duration: 10000,
      clips: [],
    })
    graph.map(['vout'], 'participant_thumb.mp4')
    await ffmux(graph)
  }

  {
    // clip spans whole duration
    const graph = new FilterGraph([file])
    renderParticipantTrack(graph, 'vout', {
      participant: { id: '0', name: 'Big Buck Bunny' },
      duration: 10000,
      clips: [
        {
          videoId: '0:v',
          trim: {
            start: 10000,
            end: 20000,
          },
        },
      ],
    })
    graph.map(['vout'], 'participant_clip_1.mp4')
    await ffmux(graph)
  }

  {
    // clip smaller than track duration, show thumbnail
    const graph = new FilterGraph([file])
    renderParticipantTrack(graph, 'vout', {
      participant: { id: '0', name: 'Big Buck Bunny' },
      duration: 30000,
      clips: [
        {
          videoId: '0:v',
          trim: {
            start: 10000,
            end: 20000,
          },
          delay: 10000,
        },
      ],
    })
    graph.map(['vout'], 'participant_clip_1_thumb.mp4')
    await ffmux(graph)
  }

  {
    // thumbnail in the middle
    const graph = new FilterGraph([file, file])
    renderParticipantTrack(graph, 'vout', {
      participant: { id: '0', name: 'Big Buck Bunny' },
      duration: 30000,
      clips: [
        {
          videoId: '0:v',
          trim: {
            start: 10000,
            end: 20000,
          },
          delay: 0,
        },
        {
          videoId: '1:v',
          trim: {
            start: 30000,
            end: 40000,
          },
          delay: 20000,
        },
      ],
    })
    graph.map(['vout'], 'participant_clip_2_thumb.mp4')
    await ffmux(graph)
  }
}

async function main() {
  const [, , layout = 'grid'] = process.argv
  switch (layout) {
    case 'participant':
      await participantTrack()
      break
    case 'presentation':
      await presentationLayout()
      break
    case 'grid':
    default:
      await gridLayout()
  }
}

main()
