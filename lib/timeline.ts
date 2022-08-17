import { basename, dirname, extname, join as joinPath } from 'path'
import {
  compositeGrid,
  compositePresentation,
  mixAudio,
  renderBlackScreen,
  renderParticipantVideoTrack,
  renderSilence,
} from './api.js'
import { Resolution } from './codec.js'
import {
  ContainerMetadata,
  mergeAV,
  mux,
  concatDemux,
  probe,
} from './ffmpeg.js'
import { FilterGraph, VideoStream } from './graph.js'
import {
  isEqualSet,
  isString,
  stableReplace,
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

  constructor(public resolution: Resolution = '1080p') {}

  get duration() {
    return (
      [...this.clips.values()]
        .flat()
        .map((c) => c.endTime)
        .sort((a, b) => a - b)
        .at(-1) ?? 0
    )
  }

  async addClips(
    owner: Participant | Presentation,
    clips_: Array<string | InputClip>
  ) {
    const clips = clips_.map((c) =>
      isString(c) ? { path: c, startTime: 0 } : c
    )
    const metadata = await Promise.all(clips.map((c) => probe(c.path)))

    const clipsToAdd = metadata.map<Clip>((meta, i) => {
      // TODO FIXME handle formats where audio stream starts at negative timestamp
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
      participantClips.push(...clipsToAdd)
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

    if (potentialCutPoints.length === 0) {
      const cut = new TimelineCut([], undefined, undefined, this.resolution)
      cut.endTime = this.duration
      this.#cuts.push(cut)
      return
    }

    potentialCutPoints.sort((a, b) => a.time - b.time)
    console.table(potentialCutPoints)

    let speakers: Participant[] = []
    let presentations: Presentation[] = []

    this.#cuts = [new TimelineCut([], undefined, undefined, this.resolution)]

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

      const prevCut = this.#cuts.at(-1)
      const visibleSpeakers = prevCut
        ? stableReplace(prevCut.speakers, nextVisibleSpeakers)
        : [...nextVisibleSpeakers]

      if (prevCut) {
        prevCut.endTime = point.time - VideoStream.frameperiod
      }
      const cut = new TimelineCut(
        visibleSpeakers,
        presentations.at(-1),
        point.time,
        this.resolution
      )
      cut.cause = point
      this.#cuts.push(cut)
    }
    const last = this.#cuts.pop()
    if (last && last.endTime < Infinity) {
      this.#cuts.push(last)
    }
  }

  async render(outputPath: string) {
    this.#findCuts()
    console.table(
      this.#cuts.map((cut) => ({
        ...cut,
        speakers: cut.speakers.map((s) => s.name),
        presentation: cut.presentation?.title,
        cause: {
          kind: cut.cause?.kind,
          time: cut.cause?.time,
        },
      }))
    )

    const dir = dirname(outputPath)
    const base = basename(outputPath, extname(outputPath))
    const vidconcatFile = joinPath(dir, base + '_concat.mp4')
    const audmixFile = joinPath(dir, base + '_mix.aac')

    const cutOutputs: string[] = []
    for (const cut of this.#cuts) {
      if (cut.startTime < cut.endTime) {
        cutOutputs.push(await cut.render(this.clips, dir))
      }
    }

    await concatDemux(cutOutputs, vidconcatFile, false)

    {
      const allClips = [...this.clips.values()].flat()
      const audioClips = allClips.filter((c) => c.hasAudio)
      const graph = await new FilterGraph(audioClips).init()

      if (audioClips.length === 0) {
        renderSilence(graph, ['aout'], this.duration)
      } else {
        const delays = audioClips.map((c) => c.startTime)
        mixAudio(graph, ['aout'], delays)
      }

      graph.map(['aout'], audmixFile)
      await mux(graph, false, true)
    }

    try {
      await mergeAV(audmixFile, vidconcatFile, outputPath, false)
    } finally {
      await Promise.all(
        [...cutOutputs, audmixFile, vidconcatFile].map(unlinkNoThrow)
      )
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
    public startTime = 0,
    public resolution: Resolution = '1080p'
  ) {}

  async render(allClips: Timeline['clips'], outputDir: string) {
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
        const vidId = graph.rootVideoStreamsByInput.get(clip)
        if (!vidId) return []
        const trimStart = this.startTime - clip.startTime
        const trimEnd =
          this.endTime < clip.endTime
            ? trimStart + (this.endTime - this.startTime)
            : Infinity
        const delay = Math.max(0, clip.startTime - this.startTime)
        return [
          {
            streamId: vidId,
            kind: 'video',
            trim: {
              start: trimStart,
              end: trimEnd,
            },
            delay,
          },
        ]
      })

      const track: Track = {
        duration: this.endTime - this.startTime,
        cuts: trackCuts,
      }
      renderParticipantVideoTrack(graph, `${speaker.id}:track`, track, speaker)
    }

    let presentationId = presentationClip
      ? graph.rootVideoStreamsByInput.get(presentationClip) ?? null
      : null
    if (presentationClip && presentationId) {
      const trimStart = this.startTime - presentationClip.startTime
      const trimEnd =
        this.endTime < presentationClip.endTime
          ? trimStart + (this.endTime - this.startTime)
          : Infinity
      if (trimStart > 0 || trimEnd < Infinity) {
        const trimmedId = `${presentationId}:trim`
        graph
          .pipe([presentationId], [trimmedId])
          .filterIf(trimStart > 0, 'trim', [], {
            start: trimStart / 1000,
          })
          .filterIf(trimEnd < Infinity, 'trim', [], {
            end: trimEnd / 1000,
          })
        presentationId = trimmedId
      }

      compositePresentation(graph, ['vout'], presentationId, this.resolution)
    } else if (this.speakers.length > 0) {
      compositeGrid(graph, ['vout'], this.resolution)
    } else if (graph.leafVideoStreams.size === 0) {
      renderBlackScreen(
        graph,
        ['vout'],
        this.endTime - this.startTime,
        this.resolution
      )
    }

    const output = joinPath(outputDir, `cut_${this.startTime / 1000}.mp4`)
    graph.map(['vout'], output, this.resolution)
    await mux(graph, false, true)
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
