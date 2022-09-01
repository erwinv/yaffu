import { Timeline } from 'yaffu'
import { file, maybeDownloadInputFile } from './index.mjs'

await maybeDownloadInputFile()

const timeline = new Timeline('1080p')

/*
          5    10   15   20   25   30   35   40   45   50   55   60   65   70   75   80
----------|----|----|----|----|----|----|----|----|----|----|----|----|----|----|----|----|----|--
alice     [===========]                 [=======================================]
bob          [===========]                   [========================]                           
charlie         [===========]                     [==============]                                
david              [===========]                       [====]                                     
screen                             [=======================================]                      
*/

timeline.addTrack('Alice').addClips([
  {
    path: file,
    startOffset: 5000,
    overrideDuration: 12000,
  },
  {
    path: file,
    opts: ['-ss 12'],
    startOffset: 35000,
    overrideDuration: 40000,
  },
])

timeline.addTrack('Bob').addClips([
  {
    path: file,
    opts: ['-ss 80'],
    startOffset: 8000,
    overrideDuration: 12000,
  },
  {
    path: file,
    opts: ['-ss 92'],
    startOffset: 40000,
    overrideDuration: 25000,
  },
])

timeline.addTrack('Charlie').addClips([
  {
    path: file,
    opts: ['-ss 120'],
    startOffset: 11000,
    overrideDuration: 12000,
  },
  {
    path: file,
    opts: ['-ss 132'],
    startOffset: 45000,
    overrideDuration: 15000,
  },
])

timeline.addTrack('David').addClips([
  {
    path: file,
    opts: ['-ss 160'],
    startOffset: 14000,
    overrideDuration: 12000,
  },
  {
    path: file,
    opts: ['-ss 172'],
    startOffset: 50000,
    overrideDuration: 5000,
  },
])

timeline.addTrack('Desktop', 'presentation').addClip({
  path: file,
  opts: ['-ss 180'],
  startOffset: 30000,
  overrideDuration: 40000,
})

await timeline.render('timeline.mp4')
