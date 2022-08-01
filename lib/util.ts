import { noop, toNumber } from 'lodash-es'
import { createWriteStream } from 'fs'
import { unlink } from 'fs/promises'
import { basename, join as joinPath } from 'path'
import { Readable } from 'stream'

export function asyncNoThrow<Args extends readonly unknown[], R>(
  fn: (...args: Args) => Promise<R>
) {
  return async (...args: Args) => fn(...args).catch(noop)
}

export const unlinkNoThrow = asyncNoThrow(unlink)

type WebFetchResponse = Response
type NodeReadable = Readable

export function fromWebFetch(response: WebFetchResponse): NodeReadable {
  const totalLength = toNumber(response.headers.get('Content-Length') ?? '0')

  if (!response.body || totalLength === 0) {
    return new Readable({
      objectMode: true,
      read() {
        this.push(null)
      },
    })
  }

  const reader = response.body.getReader()

  return new Readable({
    objectMode: true,
    async read() {
      const { done, value } = await reader.read()
      this.push(done ? null : value)
    },
    async destroy() {
      await reader.cancel()
    },
  })
}

// TODO For Node LTS using node-fetch NPM lib
// export function fromNodeFetch(response: NodeFetchResponse) {
//   return (
//     response.body ??
//     new Readable({
//       objectMode: true,
//       read() {
//         this.push(null)
//       },
//     })
//   )
// }

export async function downloadFile(url: URL, dir: string) {
  const filename = basename(url.pathname)
  const downloadPath = joinPath(dir, filename)

  const response = await fetch(url.href)
  if (!response.ok) throw new Error()

  await new Promise((resolve, reject) => {
    if (!response.body) return reject()
    fromWebFetch(response)
      .pipe(createWriteStream(downloadPath))
      .on('error', reject)
      .on('close', resolve)
  })

  return downloadPath
}
