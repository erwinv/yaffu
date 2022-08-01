import { range, take } from 'lodash-es'
import { constants } from 'fs'
import { access } from 'fs/promises'
import { genericCombine, ffmux, ffconcatDemux } from 'yaffu'
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

async function main() {
  await maybeDownloadInputFile()

  const inputOpts = range(16).map((i) => [`-ss ${i * 10}`, '-t 10'])
  const outputs = range(1, 17).map(i => `combined_${i}.mp4`)

  for (const i of range(1, 17)) {
    const inputs = take(inputOpts, i)
      .map(opts => [file, opts])
      .reverse()
    await ffmux(genericCombine(inputs, outputs[i]))
  }

  await ffconcatDemux(outputs, 'combined_concatenated.mp4')
}

main()
