import { ffprobe } from '../build/index.js'

const [,, file] = process.argv

if (!file) throw new Error()

const meta = await ffprobe(file)
console.dir(meta)
