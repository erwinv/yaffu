import { extname } from 'path'
import { isArray, isString } from './util.js'
import { Codec, ENCODER, ENCODER_OPTS, Resolution } from './codec.js'
import { probe } from './ffmpeg.js'
import { InputClip } from './timeline.js'

export class BaseStream {
  codec?: Codec
  constructor(public id: string) {}
}

export class AudioStream extends BaseStream {
  serialize() {
    if (!this.codec) throw new Error(`Not an output stream: [${this.id}]`)
    return [
      `-map "[${this.id}]"`,
      `-c:a ${ENCODER[this.codec]}`,
      ...ENCODER_OPTS[this.codec](),
    ].join(' ')
  }
}

export class VideoStream extends BaseStream {
  framerate = 30
  resolution: Resolution = '1080p' // TODO hard-coded for now
  serialize() {
    if (!this.codec) throw new Error(`Not an output stream: [${this.id}]`)
    return [
      `-map "[${this.id}]"`,
      `-c:v ${ENCODER[this.codec]}`,
      ...ENCODER_OPTS[this.codec](this.resolution),
      `-r ${this.framerate}`,
    ].join(' ')
  }
}

type Stream = AudioStream | VideoStream

export class Filter {
  options: unknown[] = []
  keyValOptions: Map<string, unknown> = new Map()
  constructor(public name: string) {}
  opt(value: unknown) {
    this.options.push(value)
    return this
  }
  opts(values: unknown[]) {
    this.options.push(...values)
    return this
  }
  set(key: string, value: unknown) {
    this.keyValOptions.set(key, value)
    return this
  }
  serialize() {
    if (this.options.length + this.keyValOptions.size === 0) {
      return this.name
    }
    const options = this.options.map((v) => (isArray(v) ? v.join('|') : `${v}`))
    const kvOptions = [...this.keyValOptions.entries()].map(
      ([k, v]) => `${k}=${isArray(v) ? v.join('|') : v}`
    )
    return `${this.name}=` + [...options, ...kvOptions].join(':')
  }
}

export class Pipe {
  filters: Filter[] = []
  constructor(public inputs: string[], public outputs: string[]) {}

  filter(
    name: string,
    opts: unknown[] = [],
    kvOpts: Record<string, unknown> = {}
  ) {
    const filter = new Filter(name)
    filter.opts(opts)
    for (const [k, v] of Object.entries(kvOpts)) {
      filter.set(k, v)
    }
    this.filters.push(filter)
    return this
  }
  filterIf(
    condition: boolean,
    name: string,
    opts: unknown[] = [],
    kvOpts: Record<string, unknown> = {}
  ) {
    if (!condition) return this
    return this.filter(name, opts, kvOpts)
  }

  serialize() {
    return [
      ...this.inputs.map((streamId) => `[${streamId}]`),
      this.filters.map((f) => f.serialize()).join(','),
      ...this.outputs.map((streamId) => `[${streamId}]`),
    ].join('')
  }
}

export class FilterGraph {
  inputs: InputClip[] = []
  outputs: Map<string, Stream[]> = new Map()
  pipes: Pipe[] = []
  audioStreams: Set<string> = new Set()
  videoStreams: Set<string> = new Set()
  videoStreamsByInput: Map<InputClip, string> = new Map()

  constructor(inputs: Array<string | InputClip>) {
    for (const input_ of inputs) {
      const input = isString(input_) ? { path: input_ } : input_
      this.inputs.push(input)
    }
    this.init()
  }

  #mediaInit?: Promise<void>
  async init() {
    if (this.#mediaInit) return this.#mediaInit.then(() => this)

    this.#mediaInit = (async () => {
      const inputMetadata = await Promise.all(
        this.inputs.map((input) => input.meta ?? probe(input.path))
      )

      for (const [i, meta] of inputMetadata.entries()) {
        // TODO this assumes formats that contain at most 1 stream per type
        // are there even formats/containers that contain 2 or more video/audio streams?
        if (meta.streams.some((s) => s.codec_type === 'video')) {
          const vidId = `${i}:v`
          this.videoStreams.add(vidId)
          this.videoStreamsByInput.set(this.inputs[i], vidId)
        }
        if (meta.streams.some((s) => s.codec_type === 'audio')) {
          this.audioStreams.add(`${i}:a`)
        }
      }
    })()

    return this.#mediaInit.then(() => this)
  }

  get streams() {
    return new Set([...this.audioStreams, ...this.videoStreams])
  }

  pipe(
    _streamIds: Iterable<string>,
    outputStreamIds: string[],
    streamType: 'audio' | 'video' | '' = ''
  ) {
    const streamIds = [..._streamIds]

    for (const streamId of streamIds) {
      if (!this.streams.has(streamId))
        throw new Error(`Not a leaf stream: [${streamId}]`)

      const isAudio = this.audioStreams.has(streamId)
      const isVideo = this.videoStreams.has(streamId)

      if (!streamType) {
        streamType = isAudio ? 'audio' : 'video'
      } else {
        if (
          (isAudio && streamType !== 'audio') ||
          (isVideo && streamType !== 'video')
        )
          throw new Error(`[${streamId}] is not of type ${streamType}`)
      }

      if (isAudio) this.audioStreams.delete(streamId)
      if (isVideo) this.videoStreams.delete(streamId)
    }

    const pipe = new Pipe(streamIds, outputStreamIds)
    this.pipes.push(pipe)

    for (const outputKey of pipe.outputs) {
      if (streamType === 'audio') {
        this.audioStreams.add(outputKey)
      }
      if (streamType === 'video') {
        this.videoStreams.add(outputKey)
      }
    }

    return pipe
  }

  pipeEach(_streamIds: Iterable<string>, genOutputId: (id: string) => string) {
    const streamIds = [..._streamIds]
    const outputIds = streamIds.map(genOutputId)

    return {
      buildEach: (pipeBuilder: (pipe: Pipe, i: number) => void) => {
        let i = 0
        for (const streamId of streamIds) {
          const pipe = this.pipe([streamId], [outputIds[i]])
          pipeBuilder(pipe, i)
          ++i
        }

        return outputIds
      },
    }
  }

  pipeFoldLeft(
    _streamIds: Iterable<string>,
    genIntermediateId: (id: string) => string,
    finalId: string,
    initId: string
  ) {
    const streamIds = [..._streamIds]

    return {
      build: (folder: (pipe: Pipe, i: number) => void) => {
        let i = 0
        let prevId = initId
        for (const streamId of streamIds) {
          const nextId =
            i < streamIds.length - 1 ? genIntermediateId(streamId) : finalId
          const pipe = this.pipe([prevId, streamId], [nextId])
          folder(pipe, i)
          prevId = nextId
          ++i
        }
      },
    }
  }

  map(_streamIds: Iterable<string>, outputPath: string) {
    const streamIds = [..._streamIds]
    const outputStreams: Stream[] = []
    const outputExt = extname(outputPath)

    for (const streamId of streamIds) {
      if (!this.streams.has(streamId))
        throw new Error(`Not a leaf stream: ${streamId}`)

      const isAudio = this.audioStreams.has(streamId)
      const stream = isAudio
        ? new AudioStream(streamId)
        : new VideoStream(streamId)

      switch (outputExt) {
        case '.opus':
        case '.webm':
          stream.codec = isAudio ? 'opus' : 'vp9'
          break
        case '.aac':
        case '.mp4':
        default:
          stream.codec = isAudio ? 'aac' : 'h264'
      }

      outputStreams.push(stream)
    }

    this.outputs.set(outputPath, outputStreams)
    return this
  }

  serialize() {
    return this.pipes.map((p) => p.serialize()).join(';')
  }
}
