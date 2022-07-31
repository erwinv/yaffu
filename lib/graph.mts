import { isArray } from 'lodash-es'
import { extname } from 'path'
import { streamKey } from './util.mjs'

export class BaseStream {
  constructor(public key: string) {}
}

export class AudioStream extends BaseStream {
  public encoder?: string
  public codecOpts: string[] = ['-b:a 128k']
  setCodec(codec: 'aac' | 'opus') {
    switch (codec) {
      case 'opus':
        this.encoder = 'libopus'
        break
      case 'aac':
      default:
        this.encoder = 'aac'
    }
  }
  serialize() {
    if (!this.encoder) throw new Error('Not an output stream')
    return [
      `-map "${this.key}"`,
      `-c:a ${this.encoder}`,
      ...this.codecOpts,
    ].join(' ')
  }
}

export class VideoStream extends BaseStream {
  public encoder?: string
  public codecOpts: string[] = []
  public framerate = 30
  // public resolution = '1080p' // TODO FIXME support 720p/360p?
  setCodec(codec: 'h264' | 'vp8' | 'vp9') {
    switch (codec) {
      case 'vp8':
        this.encoder = 'libvpx'
        this.codecOpts = [
          '-b:v 4M',
          '-g 240',
          '-threads 8',
          '-quality good',
          '-crf 9',
        ]
        break
      case 'vp9':
        this.encoder = 'libvpx-vp9'
        this.codecOpts = [
          '-b:v 1800k',
          '-minrate 900k',
          '-maxrate 2610k',
          '-tile-columns 2',
          '-g 240',
          '-threads 8',
          '-quality good',
          '-crf 31',
          '-speed 2',
          '-row-mt 1',
        ]
        break
      case 'h264':
      default:
        this.encoder = 'libx264'
        this.codecOpts = ['-preset veryfast']
    }
  }
  serialize() {
    if (!this.encoder) throw new Error('Not an output stream')
    return [
      `-map "${this.key}"`,
      `-r ${this.framerate}`,
      `-c:v ${this.encoder}`,
      ...this.codecOpts,
    ].join(' ')
  }
}

type Stream = AudioStream | VideoStream

export class Filter {
  public options: unknown[] = []
  public keyValOptions: Map<string, unknown> = new Map()
  constructor(public name: string) {}
  opt(...values: unknown[]) {
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
  public filters: Filter[] = []
  constructor(public inputs: string[], public outputs: string[]) {
    for (const [i, output] of outputs.entries()) {
      this.outputs[i] = streamKey(output)
    }
  }

  filter(
    name: string,
    opts: unknown[] = [],
    kvOpts: Record<string, unknown> = {}
  ) {
    const filter = new Filter(name)
    for (const opt of opts) {
      filter.opt(opt)
    }
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
      ...this.inputs,
      this.filters.map((f) => f.serialize()).join(','),
      ...this.outputs,
    ].join('')
  }
}

export class FilterGraph {
  public streams: Map<string, Stream> = new Map() // TODO FIXME string keys only?
  public transforms: Pipe[] = []
  public outputs: Map<string, Stream[]> = new Map()

  constructor(public inputPaths: string[]) {
    for (const [i, inputPath] of inputPaths.entries()) {
      const vidKey = `[${i}:v]`
      const audKey = `[${i}:a]`

      // TODO FIXME ffprobe?
      const inputExt = extname(inputPath)
      if (['.mp4', '.mkv', '.webm'].includes(inputExt)) {
        this.streams.set(vidKey, new VideoStream(vidKey))
        this.streams.set(audKey, new AudioStream(audKey))
      } else if (['.aac', '.opus'].includes(inputExt)) {
        this.streams.set(audKey, new AudioStream(audKey))
      }
    }
  }

  get leafStreams() {
    return [...this.streams.keys()]
  }
  getLeafStreams(kind: 'audio' | 'video') {
    const streams: string[] = []
    for (const stream of this.streams.values()) {
      if (kind === 'audio' && stream instanceof AudioStream) {
        streams.push(stream.key)
      } else if (kind === 'video' && stream instanceof VideoStream) {
        streams.push(stream.key)
      }
    }
    return streams
  }

  pipe(inputKeys: string[], outputKeys: string[], kind?: 'audio' | 'video') {
    for (const [i, inputKey] of inputKeys.entries()) {
      inputKeys[i] = streamKey(inputKey)
      const stream = this.streams.get(inputKeys[i])
      if (!stream) throw new Error(`Not a leaf stream: ${inputKeys[i]}`)
      kind = stream instanceof AudioStream ? 'audio' : 'video'
      this.streams.delete(inputKeys[i])
    }

    const transform = new Pipe(inputKeys, outputKeys)
    this.transforms.push(transform)
    for (const outputKey of transform.outputs) {
      const stream =
        kind === 'audio'
          ? new AudioStream(outputKey)
          : new VideoStream(outputKey)
      this.streams.set(outputKey, stream)
    }

    return transform
  }

  mapOutput(outputKeys: string[], outputPath: string) {
    const outputStreams: Stream[] = []
    const outputExt = extname(outputPath) // TODO FIXME ffprobe?

    for (const [i, outputKey] of outputKeys.entries()) {
      outputKeys[i] = streamKey(outputKey)
      const outputStream = this.streams.get(outputKeys[i])
      if (!outputStream) throw new Error(`Not a leaf stream: ${outputKeys[i]}`)

      switch (outputExt) {
        case '.opus':
        case '.webm':
          if (outputStream instanceof AudioStream) {
            outputStream.setCodec('opus')
          }
          if (outputStream instanceof VideoStream) {
            outputStream.setCodec('vp9')
          }
          break
        case '.aac':
        case '.mp4':
        default:
          if (outputStream instanceof AudioStream) {
            outputStream.setCodec('aac')
          }
          if (outputStream instanceof VideoStream) {
            outputStream.setCodec('h264')
          }
      }

      outputStreams.push(outputStream)
    }

    this.outputs.set(outputPath, outputStreams)
    return this
  }

  serialize() {
    return this.transforms.map((t) => t.serialize()).join(';')
  }
}
