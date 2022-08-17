import { Participant, Timeline } from '../build/index.js'

const [,, output, ...inputs] = process.argv

if (!output || inputs.length < 2) throw new Error()

const timeline = new Timeline('720p')

for (const [i, input] of inputs.entries()) {
  await timeline.addClip(new Participant(`${i}`, ''), input)
}

await timeline.render(output)
