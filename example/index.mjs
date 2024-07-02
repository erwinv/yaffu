import { constants } from 'fs'
import { access } from 'fs/promises'
import { ffprobe } from 'yaffu'
import { downloadFile } from './util.mjs'

export const file = 'BigBuckBunny-720p.mp4'
const fileHost = new URL('https://f003.backblazeb2.com/file/erwinvcc')
const fileDownloadLink = new URL(file, fileHost)

export async function maybeDownloadInputFile() {
  try {
    await access(file, constants.R_OK)
    console.dir(await ffprobe(file))
  } catch {
    console.error('Downloading', fileDownloadLink.href)
    await downloadFile(fileDownloadLink, './')
  }
}
