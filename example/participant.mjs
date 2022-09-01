import { FilterGraph, renderParticipantVideoTrack, ffmux } from 'yaffu'
import { file, maybeDownloadInputFile } from './index.mjs'

await maybeDownloadInputFile()

const participant = { id: '0', name: 'Big Buck Bunny' }
{
  // no clips, just thumbnail
  const graph = await new FilterGraph([]).init()
  renderParticipantVideoTrack(
    graph,
    'vout',
    {
      duration: 10000,
      clips: [],
    },
    participant
  )
  graph.map(['vout'], 'participant_thumb_only.mp4', '720p')
  await ffmux(graph, false)
}

{
  // clip spans whole duration
  const graph = await new FilterGraph([file]).init()
  renderParticipantVideoTrack(
    graph,
    'vout',
    {
      duration: 10000,
      clips: [
        {
          streamId: '0:v',
          trim: {
            start: 10000,
            end: 20000,
          },
        },
      ],
    },
    participant
  )
  graph.map(['vout'], 'participant_clip_1.mp4', '720p')
  await ffmux(graph, false)
}

{
  // clip smaller than track duration, show thumbnail
  const graph = await new FilterGraph([file]).init()
  renderParticipantVideoTrack(
    graph,
    'vout',
    {
      duration: 30000,
      clips: [
        {
          streamId: '0:v',
          trim: {
            start: 10000,
            end: 20000,
          },
          delay: 10000,
        },
      ],
    },
    participant
  )
  graph.map(['vout'], 'participant_clip_1_thumb.mp4', '720p')
  await ffmux(graph, false)
}

{
  // thumbnail in the middle
  const graph = await new FilterGraph([file, file]).init()
  renderParticipantVideoTrack(
    graph,
    'vout',
    {
      duration: 30000,
      clips: [
        {
          streamId: '0:v',
          trim: {
            start: 10000,
            end: 20000,
          },
          delay: 0,
        },
        {
          streamId: '1:v',
          trim: {
            start: 30000,
            end: 40000,
          },
          delay: 20000,
        },
      ],
    },
    participant
  )
  graph.map(['vout'], 'participant_clip_2_thumb.mp4', '720p')
  await ffmux(graph, false)
}
