import { Timeline } from '../build/index.js'

const [, , output, ...inputs] = process.argv

if (!output || inputs.length === 0) throw new Error()

const timeline = new Timeline('720p')

for (const input of inputs) {
  await timeline.addTrack().addClip(input)
}

await timeline.render(output)
