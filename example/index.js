import { constants } from 'node:fs'
import { access } from 'node:fs/promises'
import { join } from 'node:path'
import { ffprobe } from 'yaffu'
import { downloadFile } from './util.js'

export const file = 'BigBuckBunny-720p.mp4'
const fileHost = new URL('https://f003.backblazeb2.com/')
const fileDownloadLink = new URL(join('file/erwinvcc/', file), fileHost)

export async function maybeDownloadInputFile() {
  try {
    await access(file, constants.R_OK)
    console.dir(await ffprobe(file))
  } catch {
    console.error('Downloading', fileDownloadLink.href)
    await downloadFile(fileDownloadLink, './')
  }
}
