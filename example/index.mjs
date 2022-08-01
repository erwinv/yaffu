import { range, take } from 'lodash-es'
import { constants } from 'fs'
import { access } from 'fs/promises'
import { genericCombine, ffmux } from 'yaffu'
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

  const inputs = range(16).map((i) => [file, [`-ss ${i * 10}`, '-t 10']])

  for (const i of range(1, 17)) {
    await ffmux(genericCombine(take(inputs, i), `combined_${i}.mp4`))
  }
}

main()
