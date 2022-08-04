import { ContainerMetadata, probe } from './ffmpeg.js'
import { isString } from './util.js'

interface Clip {
  path: string
  startTime: number
  endTime: number
  hasAudio: boolean
  hasVideo: boolean
  meta: ContainerMetadata
}

type InputClip = Pick<Clip, 'path' | 'startTime'>

interface Cut {
  streamId: string
  kind: 'audio' | 'video'
  trim?: {
    start: number
    end: number
  }
  delay?: number
}

export interface Track {
  duration: number
  cuts: Cut[]
}

export interface Participant {
  id: string
  name: string
}

export interface Presentation {
  id: string
  title: string
}

export default class Timeline {
  clips: Map<Participant | Presentation, Clip[]> = new Map()
  constructor(public duration: number) {}

  async addClips(
    owner: Participant | Presentation,
    clips_: Array<string | InputClip>
  ) {
    const clips = clips_.map((c) =>
      isString(c) ? { path: c, startTime: 0 } : c
    )
    const metadata = await Promise.all(clips.map((c) => probe(c.path)))

    const clipsToAdd = metadata.map<Clip>((meta, i) => {
      const startTime = clips[i].startTime + Number(meta.format.start_time)
      const endTime = startTime + Number(meta.format.duration)
      return {
        path: clips[i].path,
        startTime,
        endTime,
        hasAudio: meta.streams.some((s) => s.codec_type === 'audio'),
        hasVideo: meta.streams.some((s) => s.codec_type === 'video'),
        meta,
      }
    })

    const participantClips = this.clips.get(owner)
    if (!participantClips) {
      this.clips.set(owner, clipsToAdd)
    } else {
      clips.push(...clipsToAdd)
    }
  }
  async addClip(owner: Participant | Presentation, clip: string | InputClip) {
    return this.addClips(owner, [clip])
  }
}
