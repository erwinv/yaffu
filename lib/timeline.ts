import { ContainerMetadata, probe } from './ffmpeg.js'
import { isEqualSet, isString, takeRight } from './util.js'

interface Clip {
  path: string
  opts: string[]
  startTime: number
  endTime: number
  hasAudio: boolean
  hasVideo: boolean
  meta: ContainerMetadata
}

export type InputClip = Pick<Clip, 'path'> &
  Partial<Pick<Clip, 'opts' | 'startTime' | 'meta'>>

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
  kind: 'participant'
  id: string
  name: string
}

export interface Presentation {
  kind: 'presentation'
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
      const startTime =
        (clips[i]?.startTime ?? 0) + Number(meta.format.start_time) * 1000
      const endTime = startTime + Number(meta.format.duration) * 1000
      return {
        path: clips[i].path,
        opts: clips[i].opts ?? [],
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

  findCuts() {
    interface SpeakerCutPoint {
      time: number
      kind: 'openMic' | 'closeMic'
      participant: Participant
    }
    interface PresentationCutPoint {
      time: number
      kind: 'startShare' | 'stopShare'
      presentation: Presentation
    }

    const potentialCutPoints: Array<SpeakerCutPoint | PresentationCutPoint> = []
    for (const [owner, clips] of this.clips) {
      if (owner.kind === 'presentation') {
        potentialCutPoints.push(
          ...clips
            .filter((c) => c.hasVideo)
            .flatMap((c) => {
              return [
                {
                  time: c.startTime,
                  kind: 'startShare' as const,
                  presentation: owner,
                },
                {
                  time: c.endTime,
                  kind: 'stopShare' as const,
                  presentation: owner,
                },
              ]
            })
        )
      } else if (owner.kind === 'participant') {
        potentialCutPoints.push(
          ...clips
            .filter((c) => c.hasAudio)
            .flatMap((c) => {
              return [
                {
                  time: c.startTime,
                  kind: 'openMic' as const,
                  participant: owner,
                },
                {
                  time: c.endTime,
                  kind: 'closeMic' as const,
                  participant: owner,
                },
              ]
            })
        )
      }
    }

    potentialCutPoints.sort((a, b) => a.time - b.time)

    const cuts = []

    const speakers: Participant[] = []
    const presentations: Presentation[] = []

    for (const point of potentialCutPoints) {
      const nextSpeakers = [...speakers]
      const nextPresentations = [...presentations]
      if (point.kind === 'startShare') {
        nextPresentations.push(point.presentation)
      } else if (point.kind === 'stopShare') {
        const index = nextPresentations.findIndex(
          (p) => p === point.presentation
        )
        nextPresentations.splice(index, 1)
      } else if (point.kind === 'openMic') {
        nextSpeakers.push(point.participant)
      } else if (point.kind === 'closeMic') {
        const index = nextSpeakers.findIndex((p) => p === point.participant)
        nextSpeakers.splice(index, 1)
      }

      const areVisibleSpeakersSame = isEqualSet(
        new Set(takeRight(speakers, 4)),
        new Set(takeRight(nextSpeakers, 4))
      )
      const isVisiblePresentationSame = isEqualSet(
        new Set(takeRight(presentations, 1)),
        new Set(takeRight(nextPresentations, 1))
      )

      if (areVisibleSpeakersSame && isVisiblePresentationSame) continue

      // TODO cut start/end
    }
  }
}
