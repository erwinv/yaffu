import { Participant, Presentation, Timeline } from 'yaffu'
import { file, maybeDownloadInputFile } from './index.mjs'

await maybeDownloadInputFile()

const alice = new Participant('spk1', 'Alice')
const bob = new Participant('spk2', 'Bob')
const charlie = new Participant('spk3', 'Charlie')
const david = new Participant('spk4', 'David')
const screen = new Presentation('scr1', 'Desktop')

const timeline = new Timeline()

/*
          5    10   15   20   25   30   35   40   45   50   55   60   70   80   90
----------|----|----|----|----|----|----|----|----|----|----|----|----|----|----|----|----|----|--
alice     [===========]                 [=======================================]
bob          [===========]                   [========================]
charlie         [===========]                     [==============]
david              [===========]                       [====]
screen                             [=======================================]
*/

await timeline.addClips(alice, [{
  path: file,
  opts: ['-t 12'],
  startTime: 5000,
  duration: 12000,
}, {
  path: file,
  opts: ['-ss 17', '-t 55'],
  startTime: 35000,
  duration: 55000,
}])

await timeline.addClips(bob, [{
  path: file,
  opts: ['-ss 72', '-t 12'],
  startTime: 8000,
  duration: 20000,
}, {
  path: file,
  opts: ['-ss 84', '-t 30'],
  startTime: 40000,
  duration: 70000,
}])

await timeline.addClips(charlie, [{
  path: file,
  opts: ['-ss 114', '-t 12'],
  startTime: 11000,
  duration: 23000,
}, {
  path: file,
  opts: ['-ss 126', '-t 15'],
  startTime: 45000,
  duration: 60000,
}])

await timeline.addClips(david, [{
  path: file,
  opts: ['-ss 141', '-t 12'],
  startTime: 14000,
  duration: 26000,
}, {
  path: file,
  opts: ['-ss 153', '-t 5'],
  startTime: 50000,
  duration: 55000,
}])

await timeline.addClip(screen, {
  path: file,
  opts: ['-ss 158', '-t 50'],
  startTime: 30000,
  duration: 80000,
})

await timeline.render()
