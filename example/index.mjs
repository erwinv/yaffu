import { range, take } from 'lodash-es'
import { constants } from 'fs'
import { access } from 'fs/promises'
import {
  genericCombine,
  ffmux,
  ffconcatDemux,
  FilterGraph,
  compositePresentation,
  mixAudio,
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

  const inputOpts = range(16).map((i) => [`-ss ${i * 10}`, '-t 10'])
  const outputs = range(1, 17).map((i) => `grid_${i}.mp4`)

  for (const i of range(16)) {
    const inputs = take(inputOpts, i + 1)
      .map((opts) => [file, opts])
      .reverse()

    await ffmux(genericCombine(inputs, outputs[i]))
  }

  await ffconcatDemux(outputs, 'grid_layout.mp4')
}

async function presentationLayout() {
  await maybeDownloadInputFile()

  const inputOpts = range(9).map((i) => [`-ss ${i * 10}`, '-t 10'])
  const outputs = range(1, 6).map((i) => `presentation_${i}.mp4`)

  for (const i of range(5)) {
    const inputs = take(inputOpts, i + 1)
      .map((opt) => [file, opt])
      .reverse()

    const graph = new FilterGraph(inputs)

    compositePresentation(graph, ['vout'])
    mixAudio(graph, ['aout'])
    graph.map(['vout', 'aout'], outputs[i])

    await ffmux(graph)
  }

  await ffconcatDemux(outputs, 'presentation_layout.mp4')
}

async function main() {
  const [, , layout = 'grid'] = process.argv
  switch (layout) {
    case 'presentation':
      await presentationLayout()
      break
    case 'grid':
    default:
      await gridLayout()
  }
}

main()
