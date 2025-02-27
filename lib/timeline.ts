import { basename, dirname, extname, join as joinPath } from 'node:path'
import {
  compositeGrid,
  compositePresentation,
  mixAudio,
  renderBlackScreen,
  renderParticipantVideoTrack,
  renderSilence,
} from './api.js'
import type { Resolution } from './codec.js'
import {
  type ContainerMetadata,
  concatDemux,
  mergeAV,
  mux,
  probe,
} from './ffmpeg.js'
import { FilterGraph, VideoStream } from './graph.js'
import {
  isEqualSet,
  isString,
  monotonicId,
  partition,
  stableReplace,
  takeRight,
  unlinkNoThrow,
} from './util.js'

export interface InputClip {
  path: string
  opts?: string[]
  startOffset?: number
  meta?: ContainerMetadata
  overrideDuration?: number
}

interface Clip
  extends Required<Omit<InputClip, 'startOffset' | 'overrideDuration'>> {
  startTime: number
  duration: number
  endTime: number
  hasAudio: boolean
  hasVideo: boolean
}

interface TrimmedClip {
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
  clips: TrimmedClip[]
}

export class Participant {
  static kind = 'participant'
  constructor(
    public id: string,
    public name = '',
  ) {}
}

export class Presentation {
  static kind = 'presentation'
  constructor(
    public id: string,
    public title = '',
  ) {}
}

export class Timeline {
  #cuts: TimelineCut[] = []
  inputClips: Map<Participant | Presentation, InputClip[]> = new Map()
  startTalkTimestamps: Map<Participant, number[]> = new Map()
  clips: Map<Participant | Presentation, Clip[]> = new Map()
  // CHANGE: Updated Timeline class constructor
  constructor(
    public resolution: Resolution = '1080p',
    public includeVideoOnlyCuts = false, // New option to enable video-only cuts
  ) {}

  get duration() {
    return (
      [...this.clips.values()]
        .flat()
        .map((c) => c.endTime)
        .sort((a, b) => a - b)
        .at(-1) ?? 0
    )
  }

  static id = monotonicId('track')
  nextId() {
    return Timeline.id.next().value ?? ''
  }

  addTrack(
    nameOrTitle = '',
    kind: 'participant' | 'presentation' = 'participant',
  ) {
    const track =
      kind === 'participant'
        ? new Participant(this.nextId(), nameOrTitle)
        : new Presentation(this.nextId(), nameOrTitle)
    const trackClips: InputClip[] = []
    this.inputClips.set(track, trackClips)
    const startTalkTimestamps: number[] = []
    if (track instanceof Participant)
      this.startTalkTimestamps.set(track, startTalkTimestamps)
    const builder = {
      addClip: (...inputClips: Array<string | InputClip>) => {
        return builder.addClips(inputClips)
      },
      addClips: (inputClips: Array<string | InputClip>) => {
        const clips = inputClips.map((inputClip) =>
          isString(inputClip) ? { path: inputClip, startOffset: 0 } : inputClip,
        )
        trackClips.push(...clips)
        return builder
      },
      startTalkAt: (...timestamps: number[]) => {
        startTalkTimestamps.push(...timestamps)
        return builder
      },
    }
    return builder
  }

  addClips(
    owner: Participant | Presentation,
    clips_: Array<string | InputClip>,
  ) {
    const clips = clips_.map((c) =>
      isString(c) ? { path: c, startOffset: 0 } : c,
    )

    const participantClips = this.inputClips.get(owner)
    if (!participantClips) {
      this.inputClips.set(owner, clips)
    } else {
      participantClips.push(...clips)
    }
  }
  async addClip(owner: Participant | Presentation, clip: string | InputClip) {
    return this.addClips(owner, [clip])
  }

  #findCuts() {
    console.log('Starting #findCuts method')
    // CHANGE: Use SpeakerCutPoint which includes all possible cut point kinds
    const potentialCutPoints: Array<SpeakerCutPoint | PresentationCutPoint> = []

    for (const [owner, clips] of this.clips) {
      console.log(
        `Processing clips for owner: ${
          owner instanceof Participant ? 'Participant' : 'Presentation'
        } ${owner.id}`,
      )
      if (owner instanceof Presentation) {
        potentialCutPoints.push(
          ...clips
            .filter((c) => c.hasVideo)
            .flatMap((c) => {
              console.log(
                `Adding cut points for presentation clip: start=${c.startTime}, end=${c.endTime}`,
              )
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
            }),
        )
      } else if (owner instanceof Participant) {
        potentialCutPoints.push(
          ...clips
            // CHANGE: Include video-only clips if the new option is enabled
            .filter(
              (c) => c.hasAudio || (this.includeVideoOnlyCuts && c.hasVideo),
            )
            .flatMap((c): SpeakerCutPoint[] => {
              console.log(
                `Adding cut points for participant clip: start=${c.startTime}, end=${c.endTime}, hasAudio=${c.hasAudio}, hasVideo=${c.hasVideo}`,
              )
              const points: SpeakerCutPoint[] = []
              if (c.hasAudio) {
                points.push(
                  {
                    time: c.startTime,
                    kind: 'openMic',
                    participant: owner,
                  },
                  {
                    time: c.endTime,
                    kind: 'closeMic',
                    participant: owner,
                  },
                )
              }
              // CHANGE: Add cut points for video-only clips if the new option is enabled
              if (this.includeVideoOnlyCuts && c.hasVideo && !c.hasAudio) {
                points.push(
                  {
                    time: c.startTime,
                    kind: 'startVideo',
                    participant: owner,
                  },
                  {
                    time: c.endTime,
                    kind: 'stopVideo',
                    participant: owner,
                  },
                )
              }
              return points
            }),
        )
      }
    }

    for (const [participant, startTalkTimestamps] of this.startTalkTimestamps) {
      for (const time of startTalkTimestamps) {
        console.log(
          `Adding startTalk cut point for participant ${participant.id} at time ${time}`,
        )
        potentialCutPoints.push({
          time: time,
          kind: 'startTalk',
          participant,
        })
      }
    }

    if (potentialCutPoints.length === 0) {
      console.log(
        'No potential cut points found. Creating a single cut for the entire duration.',
      )
      const cut = new TimelineCut([], undefined, undefined, this.resolution)
      cut.endTime = this.duration
      this.#cuts.push(cut)
      return
    }

    potentialCutPoints.sort((a, b) => a.time - b.time)
    console.table(potentialCutPoints)

    let speakers: Participant[] = []
    let talkers: Participant[] = []
    let presentations: Presentation[] = []

    this.#cuts = [new TimelineCut([], undefined, undefined, this.resolution)]

    for (const point of potentialCutPoints) {
      console.log(`Processing cut point: ${JSON.stringify(point)}`)
      const nextSpeakers = [...speakers]
      const nextPresentations = [...presentations]
      if (point.kind === 'startShare') {
        nextPresentations.push(point.presentation)
      } else if (point.kind === 'stopShare') {
        const index = nextPresentations.findIndex(
          (p) => p === point.presentation,
        )
        nextPresentations.splice(index, 1)
        // CHANGE: Handle video-only cut points
      } else if (
        point.kind === 'openMic' ||
        (this.includeVideoOnlyCuts && point.kind === 'startVideo')
      ) {
        nextSpeakers.push(point.participant)
      } else if (
        point.kind === 'closeMic' ||
        (this.includeVideoOnlyCuts && point.kind === 'stopVideo')
      ) {
        {
          const index = nextSpeakers.findIndex((p) => p === point.participant)
          nextSpeakers.splice(index, 1)
        }
        {
          const index = talkers.findIndex((p) => p === point.participant)
          talkers.splice(index, 1)
        }
      } else if (point.kind === 'startTalk') {
        if (
          !talkers.includes(point.participant) &&
          talkers.push(point.participant) > 4
        ) {
          talkers = talkers.slice(-4)
        }
      }

      const prevCut = this.#cuts.at(-1)

      const prevVisibleSpeakers = new Set(
        prevCut?.speakers ?? takeRight(speakers, 4),
      )
      const nextVisibleSpeakers = new Set(
        takeRight(
          partition(nextSpeakers, (s) => !talkers.includes(s)).flat(),
          4,
        ),
      )
      const areVisibleSpeakersSame = isEqualSet(
        prevVisibleSpeakers,
        nextVisibleSpeakers,
      )
      const isVisiblePresentationSame = isEqualSet(
        new Set(takeRight(presentations, 1)),
        new Set(takeRight(nextPresentations, 1)),
      )

      console.log(`Visible speakers changed: ${!areVisibleSpeakersSame}`)
      console.log(`Visible presentation changed: ${!isVisiblePresentationSame}`)

      speakers = nextSpeakers
      presentations = nextPresentations

      if (areVisibleSpeakersSame && isVisiblePresentationSame) {
        console.log(
          'No change in visible speakers or presentations. Continuing to next cut point.',
        )
        continue
      }

      const visibleSpeakers = prevCut
        ? stableReplace(prevCut.speakers, nextVisibleSpeakers)
        : [...nextVisibleSpeakers]

      if (prevCut) {
        prevCut.endTime = point.time - VideoStream.frameperiod
        console.log(`Setting end time of previous cut to ${prevCut.endTime}`)
      }
      const cut = new TimelineCut(
        visibleSpeakers,
        presentations.at(-1),
        point.time,
        this.resolution,
      )
      cut.cause = point
      this.#cuts.push(cut)
      console.log(`Created new cut: ${JSON.stringify(cut)}`)
    }
    const last = this.#cuts.pop()
    if (last && last.endTime < Number.POSITIVE_INFINITY) {
      this.#cuts.push(last)
      console.log(`Re-added last cut with end time ${last.endTime}`)
    }

    console.log('Final cuts:')
    console.table(
      this.#cuts.map((cut) => ({
        startTime: cut.startTime,
        endTime: cut.endTime,
        speakers: cut.speakers.map((s) => s.id),
        presentation: cut.presentation?.id,
        cause: cut.cause?.kind,
      })),
    )
  }

  async render(outputPath: string) {
    for (const [owner, inputClips] of this.inputClips.entries()) {
      const metadata = await Promise.all(inputClips.map((c) => probe(c.path)))
      const clips = metadata.map<Clip>((meta, i) => {
        // TODO FIXME handle formats where audio stream starts at negative timestamp
        const { overrideDuration } = inputClips[i]

        const startTime =
          (inputClips[i]?.startOffset ?? 0) +
          Number(meta.format.start_time) * 1000
        const duration = overrideDuration ?? Number(meta.format.duration) * 1000
        const endTime = startTime + duration

        const opts: string[] = inputClips[i].opts ?? []
        if (overrideDuration) {
          opts.push(`-t ${overrideDuration / 1000}`)
        }

        return {
          path: inputClips[i].path,
          opts,
          startTime,
          duration,
          endTime,
          hasAudio: meta.streams.some((s) => s.codec_type === 'audio'),
          hasVideo: meta.streams.some((s) => s.codec_type === 'video'),
          meta,
        }
      })

      this.clips.set(owner, clips)
    }

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
      })),
    )

    const dir = dirname(outputPath)
    const base = basename(outputPath, extname(outputPath))
    const vidconcatFile = joinPath(dir, `${base}_concat.mp4`)
    const audmixFile = joinPath(dir, `${base}_mix.aac`)

    const cutOutputs: string[] = []
    for (const cut of this.#cuts) {
      const cutDuration = cut.endTime - cut.startTime
      if (cutDuration > VideoStream.frameperiod) {
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
        [...cutOutputs, audmixFile, vidconcatFile].map(unlinkNoThrow),
      )
    }
  }
}

// CHANGE: Updated cut point type definitions
// Define a base type for all possible cut point kinds
type BaseCutPointKind =
  | 'openMic'
  | 'closeMic'
  | 'startTalk'
  | 'startVideo'
  | 'stopVideo'

// Define a type for the original cut point kinds
type OriginalCutPointKind = 'openMic' | 'closeMic' | 'startTalk'

// Create a generic interface that can be used with or without video-only cut points
interface GenericSpeakerCutPoint<
  T extends BaseCutPointKind = OriginalCutPointKind,
> {
  time: number
  kind: T
  participant: Participant
}

// Define the SpeakerCutPoint type based on whether video-only cuts are included
type SpeakerCutPoint = GenericSpeakerCutPoint<BaseCutPointKind>

// If you need to refer to the original type without video-only cuts, you can use:
// type OriginalSpeakerCutPoint = GenericSpeakerCutPoint<OriginalCutPointKind>

interface PresentationCutPoint {
  time: number
  kind: 'startShare' | 'stopShare'
  presentation: Presentation
}

class TimelineCut {
  endTime = Number.POSITIVE_INFINITY
  cause?: SpeakerCutPoint | PresentationCutPoint
  constructor(
    public speakers: Participant[],
    public presentation?: Presentation,
    public startTime = 0,
    public resolution: Resolution = '1080p',
  ) {}

  async render(allClips: Timeline['clips'], outputDir: string) {
    const clips = this.speakers
      .flatMap((s) => allClips.get(s) ?? [])
      .filter(
        (clip) =>
          clip.hasVideo &&
          overlaps(
            { start: this.startTime, end: this.endTime },
            { start: clip.startTime, end: clip.endTime },
          ),
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
      const trackCuts = speakerVideoClips.flatMap<TrimmedClip>((clip) => {
        const vidId = graph.rootVideoStreamsByInput.get(clip)
        if (!vidId) return []
        const trimStart = this.startTime - clip.startTime
        const trimEnd =
          this.endTime < clip.endTime
            ? trimStart + (this.endTime - this.startTime)
            : Number.POSITIVE_INFINITY
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
        clips: trackCuts,
      }
      renderParticipantVideoTrack(graph, `${speaker.id}:track`, track, speaker)
    }

    let presentationId = presentationClip
      ? (graph.rootVideoStreamsByInput.get(presentationClip) ?? null)
      : null
    if (presentationClip && presentationId) {
      const trimStart = this.startTime - presentationClip.startTime
      const trimEnd =
        this.endTime < presentationClip.endTime
          ? trimStart + (this.endTime - this.startTime)
          : Number.POSITIVE_INFINITY
      if (trimStart > 0 || trimEnd < Number.POSITIVE_INFINITY) {
        const trimmedId = `${presentationId}:trim`
        graph
          .pipe([presentationId], [trimmedId])
          .filterIf(trimStart > 0, 'trim', [], {
            start: trimStart / 1000,
          })
          .filterIf(trimEnd < Number.POSITIVE_INFINITY, 'trim', [], {
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
        this.resolution,
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
