import { noop } from 'es-toolkit'
import { createWriteStream } from 'node:fs'
import { unlink } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'

export async function downloadFile(url, dir) {
  const filename = basename(url.pathname)
  const downloadPath = join(dir, filename)

  const res = await fetch(url)

  if (!res.ok) throw res

  await pipeline(Readable.fromWeb(res.body), createWriteStream(downloadPath))

  return downloadPath
}

export const unlinkNoThrow = (...args) => unlink(...args).catch(noop)
