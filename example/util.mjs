import { get } from 'https'
import { basename, join as joinPath } from 'path'
import { createWriteStream, pipeline } from 'stream'

export async function downloadFile(url, dir) {
  const filename = basename(url.pathname)
  const downloadPath = joinPath(dir, filename)

  return new Promise((resolve, reject) => {
    get(url, (res) => {
      if (res.statusCode !== 200) reject(res.statusCode)
      pipeline(res, createWriteStream(downloadPath), (err) => {
        if (err) reject(err)
        else resolve(downloadPath)
      })
    }).on('error', reject)
  })
}
