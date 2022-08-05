import {
  compositeGrid,
  compositePresentation,
  mixAudio,
  renderParticipantVideoTrack,
} from './api.js'
import { ContainerMetadata, mergeAV, mux, probe } from './ffmpeg.js'
import { FilterGraph } from './graph.js'
import { ffconcatDemux } from './index.js'
import {
  isEqualSet,
  isString,
  setDiff,
  takeRight,
  unlinkNoThrow,
} from './util.js'

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
  Partial<Pick<Clip, 'opts' | 'startTime' | 'meta'>> & { duration?: number }

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

export class Participant {
  static kind = 'participant'
  constructor(public id: string, public name: string) {}
}

export class Presentation {
  static kind = 'presentation'
  constructor(public id: string, public title: string) {}
}

export class Timeline {
  #cuts: TimelineCut[] = []
  clips: Map<Participant | Presentation, Clip[]> = new Map()

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
      const endTime =
        startTime + (clips[i].duration ?? Number(meta.format.duration) * 1000)
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

  #findCuts() {
    const potentialCutPoints: Array<SpeakerCutPoint | PresentationCutPoint> = []
    for (const [owner, clips] of this.clips) {
      if (owner instanceof Presentation) {
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
      } else if (owner instanceof Participant) {
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

    let speakers: Participant[] = []
    let presentations: Presentation[] = []

    // TODO FIXME initial cut
    // TODO FIXME empty cut (black screen)
    // TODO FIXME multiple events on the same cut point
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

      const prevVisibleSpeakers = new Set(takeRight(speakers, 4))
      const nextVisibleSpeakers = new Set(takeRight(nextSpeakers, 4))
      const areVisibleSpeakersSame = isEqualSet(
        prevVisibleSpeakers,
        nextVisibleSpeakers
      )
      const isVisiblePresentationSame = isEqualSet(
        new Set(takeRight(presentations, 1)),
        new Set(takeRight(nextPresentations, 1))
      )

      speakers = nextSpeakers
      presentations = nextPresentations

      if (areVisibleSpeakersSame && isVisiblePresentationSame) continue

      const visibleSpeakers = [...nextVisibleSpeakers]
      const prevCut = this.#cuts.at(-1)
      // TODO FIXME stable replace
      // if (prevCut) {
      //   const [speakerToHide] = setDiff(
      //     prevVisibleSpeakers,
      //     nextVisibleSpeakers
      //   )
      //   const [speakerToShow] = setDiff(
      //     nextVisibleSpeakers,
      //     prevVisibleSpeakers
      //   )
      //   const index = prevCut.speakers.indexOf(speakerToHide)
      //   if (speakerToShow) {
      //     visibleSpeakers.splice(index, 1, speakerToShow)
      //   } else {
      //     visibleSpeakers.splice(index, 1)
      //   }
      // }

      if (prevCut) {
        prevCut.endTime = point.time
        if (prevCut.endTime === prevCut.startTime) {
          const prev = this.#cuts.pop()
          const prevprev = this.#cuts.pop()
          if (prev && prevprev) {
            prev.startTime = prevprev.startTime
            prev.speakers.push(...prevprev.speakers)
            this.#cuts.push(prev)
          }
        }
      }
      const cut = new TimelineCut(
        visibleSpeakers,
        presentations.at(-1),
        point.time
      )
      cut.cause = point
      if (
        cut.endTime < Infinity ||
        cut.speakers.length > 0 ||
        cut.presentation
      ) {
        this.#cuts.push(cut)
      }
    }
  }

  async render() {
    this.#findCuts()
    console.dir(this.#cuts, { depth: null })
    return

    const cutOutputs: string[] = []
    for (const cut of this.#cuts) {
      cutOutputs.push(await cut.render(this.clips))
    }

    await ffconcatDemux(cutOutputs, 'concat.mp4')

    {
      const audioClips = [...this.clips.values()]
        .flat()
        .filter((c) => c.hasAudio)
      const delays = audioClips.map((c) => c.startTime)
      const graph = await new FilterGraph(audioClips).init()
      mixAudio(graph, ['aout'], delays)
      graph.map(['aout'], 'mix.aac')
      await mux(graph)
    }

    try {
      await mergeAV('mix.aac', 'concat.mp4', 'render.mp4')
    } finally {
      // await Promise.all(
      //   [...cutOutputs, 'mix.aac', 'concat.mp4'].map(unlinkNoThrow)
      // )
    }
  }
}

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

class TimelineCut {
  endTime = Infinity
  cause?: SpeakerCutPoint | PresentationCutPoint
  constructor(
    public speakers: Participant[],
    public presentation?: Presentation,
    public startTime = 0
  ) {}

  async render(allClips: Timeline['clips']) {
    const clips = this.speakers
      .flatMap((s) => allClips.get(s) ?? [])
      .filter(
        (clip) =>
          clip.hasVideo &&
          overlaps(
            { start: this.startTime, end: this.endTime },
            { start: clip.startTime, end: clip.endTime }
          )
      )
    const presentationClip = this.presentation
      ? allClips
          .get(this.presentation)
          ?.filter((c) => c.hasVideo)
          .at(0)
      : null
    if (presentationClip) {
      clips.unshift(presentationClip)
    }
    const graph = await new FilterGraph(clips).init()

    for (const speaker of this.speakers) {
      const speakerVideoClips =
        allClips.get(speaker)?.filter((c) => c.hasVideo) ?? []
      const trackCuts = speakerVideoClips.flatMap<Cut>((clip) => {
        const vidId = graph.videoStreamsByInput.get(clip)
        if (!vidId) return []
        return [
          {
            streamId: vidId,
            kind: 'video',
            trim: {
              start: this.startTime - clip.startTime,
              end:
                this.endTime < clip.endTime
                  ? clip.endTime - this.endTime
                  : Infinity,
            },
            delay: this.startTime - clip.startTime,
          },
        ]
      })

      const track: Track = {
        duration: this.endTime - this.startTime,
        cuts: trackCuts,
      }
      renderParticipantVideoTrack(graph, `${speaker.id}:track`, track, speaker)
    }

    const presentationId = presentationClip
      ? graph.videoStreamsByInput.get(presentationClip) ?? null
      : null

    if (presentationId) {
      compositePresentation(graph, ['vout'], presentationId)
    } else {
      compositeGrid(graph, ['vout'])
    }

    const output = `cut_${this.startTime}.mp4`
    graph.map(['vout'], output)
    await mux(graph)
    return output
  }
}

interface TimelineInterval {
  start: number
  end: number
}

function overlaps(target: TimelineInterval, query: TimelineInterval) {
  if (query.end <= target.start) return false
  if (query.start >= target.end) return false
  return true
}
