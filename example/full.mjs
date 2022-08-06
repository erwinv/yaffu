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
          5    10   15   20   25   30   35   40   45   50   55   60   65   70   75   80
----------|----|----|----|----|----|----|----|----|----|----|----|----|----|----|----|----|----|--
alice     [===========]                 [=======================================]
bob          [===========]                   [========================]
charlie         [===========]                     [==============]
david              [===========]                       [====]
screen                             [=======================================]
*/

await timeline.addClips(alice, [
  {
    path: file,
    opts: ['-t 12'],
    startTime: 5000,
    duration: 12000,
  },
  {
    path: file,
    opts: ['-ss 12', '-t 40'],
    startTime: 35000,
    duration: 40000,
  },
])

await timeline.addClips(bob, [
  {
    path: file,
    opts: ['-ss 80', '-t 12'],
    startTime: 8000,
    duration: 12000,
  },
  {
    path: file,
    opts: ['-ss 92', '-t 25'],
    startTime: 40000,
    duration: 25000,
  },
])

await timeline.addClips(charlie, [
  {
    path: file,
    opts: ['-ss 120', '-t 12'],
    startTime: 11000,
    duration: 12000,
  },
  {
    path: file,
    opts: ['-ss 132', '-t 15'],
    startTime: 45000,
    duration: 15000,
  },
])

await timeline.addClips(david, [
  {
    path: file,
    opts: ['-ss 160', '-t 12'],
    startTime: 14000,
    duration: 12000,
  },
  {
    path: file,
    opts: ['-ss 172', '-t 5'],
    startTime: 50000,
    duration: 5000,
  },
])

await timeline.addClip(screen, {
  path: file,
  opts: ['-ss 180', '-t 40'],
  startTime: 30000,
  duration: 40000,
})

await timeline.render()
