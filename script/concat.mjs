import { ffconcatDemux } from '../build/index.js'

const [, , output, ...inputs] = process.argv

if (!output || inputs.length === 0) throw new Error()

await ffconcatDemux(inputs, output)
