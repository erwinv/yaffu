import { isArray, isString } from 'lodash-es';
import { extname } from 'path';
import { ENCODER, ENCODER_OPTS } from './codec.js';
export class BaseStream {
    constructor(id) {
        this.id = id;
    }
}
export class AudioStream extends BaseStream {
    serialize() {
        if (!this.codec)
            throw new Error(`Not an output stream: [${this.id}]`);
        return [
            `-map "[${this.id}]"`,
            `-c:a ${ENCODER[this.codec]}`,
            ...ENCODER_OPTS[this.codec](),
        ].join(' ');
    }
}
export class VideoStream extends BaseStream {
    constructor() {
        super(...arguments);
        this.framerate = 30;
        this.resolution = '1080p'; // TODO hard-coded for now
    }
    serialize() {
        if (!this.codec)
            throw new Error(`Not an output stream: [${this.id}]`);
        return [
            `-map "[${this.id}]"`,
            `-c:v ${ENCODER[this.codec]}`,
            ...ENCODER_OPTS[this.codec](this.resolution),
            `-r ${this.framerate}`,
        ].join(' ');
    }
}
export class Filter {
    constructor(name) {
        this.name = name;
        this.options = [];
        this.keyValOptions = new Map();
    }
    opt(...values) {
        this.options.push(...values);
        return this;
    }
    set(key, value) {
        this.keyValOptions.set(key, value);
        return this;
    }
    serialize() {
        if (this.options.length + this.keyValOptions.size === 0) {
            return this.name;
        }
        const options = this.options.map((v) => (isArray(v) ? v.join('|') : `${v}`));
        const kvOptions = [...this.keyValOptions.entries()].map(([k, v]) => `${k}=${isArray(v) ? v.join('|') : v}`);
        return `${this.name}=` + [...options, ...kvOptions].join(':');
    }
}
export class Pipe {
    constructor(inputs, outputs) {
        this.inputs = inputs;
        this.outputs = outputs;
        this.filters = [];
    }
    filter(name, opts = [], kvOpts = {}) {
        const filter = new Filter(name);
        for (const opt of opts) {
            filter.opt(opt);
        }
        for (const [k, v] of Object.entries(kvOpts)) {
            filter.set(k, v);
        }
        this.filters.push(filter);
        return this;
    }
    filterIf(condition, name, opts = [], kvOpts = {}) {
        if (!condition)
            return this;
        return this.filter(name, opts, kvOpts);
    }
    serialize() {
        return [
            ...this.inputs.map((streamId) => `[${streamId}]`),
            this.filters.map((f) => f.serialize()).join(','),
            ...this.outputs.map((streamId) => `[${streamId}]`),
        ].join('');
    }
}
export class FilterGraph {
    constructor(inputs) {
        this.inputs = [];
        this.outputs = new Map();
        this.pipes = [];
        this.audioStreams = new Set();
        this.videoStreams = new Set();
        for (const [i, input] of inputs.entries()) {
            const inputPath = isString(input) ? input : input[0];
            const inputOpts = isString(input) ? [] : input[1];
            this.inputs.push([inputPath, inputOpts]);
            const vidId = `${i}:v`;
            const audId = `${i}:a`;
            // TODO FIXME ffprobe?
            const inputExt = extname(inputPath);
            if (['.mp4', '.mkv', '.webm'].includes(inputExt)) {
                this.videoStreams.add(vidId);
                this.audioStreams.add(audId);
            }
            else if (['.aac', '.opus'].includes(inputExt)) {
                this.audioStreams.add(audId);
            }
        }
    }
    get streams() {
        return new Set([...this.audioStreams, ...this.videoStreams]);
    }
    pipe(streamIds, outputStreamIds) {
        let streamType = '';
        for (const streamId of streamIds) {
            if (!this.streams.has(streamId))
                throw new Error(`Not a leaf stream: [${streamId}]`);
            const isAudio = this.audioStreams.has(streamId);
            const isVideo = this.videoStreams.has(streamId);
            if (!streamType) {
                streamType = isAudio ? 'audio' : 'video';
            }
            else {
                if ((isAudio && streamType !== 'audio') ||
                    (isVideo && streamType !== 'video'))
                    throw new Error(`[${streamId}] is not of type ${streamType}`);
            }
            if (isAudio)
                this.audioStreams.delete(streamId);
            if (isVideo)
                this.videoStreams.delete(streamId);
        }
        const pipe = new Pipe(streamIds, outputStreamIds);
        this.pipes.push(pipe);
        for (const outputKey of pipe.outputs) {
            if (streamType === 'audio') {
                this.audioStreams.add(outputKey);
            }
            if (streamType === 'video') {
                this.videoStreams.add(outputKey);
            }
        }
        return pipe;
    }
    map(streamIds, outputPath) {
        const outputStreams = [];
        const outputExt = extname(outputPath);
        for (const streamId of streamIds) {
            if (!this.streams.has(streamId))
                throw new Error(`Not a leaf stream: ${streamId}`);
            const isAudio = this.audioStreams.has(streamId);
            const stream = isAudio
                ? new AudioStream(streamId)
                : new VideoStream(streamId);
            switch (outputExt) {
                case '.opus':
                case '.webm':
                    stream.codec = isAudio ? 'opus' : 'vp9';
                    break;
                case '.aac':
                case '.mp4':
                default:
                    stream.codec = isAudio ? 'aac' : 'h264';
            }
            outputStreams.push(stream);
        }
        this.outputs.set(outputPath, outputStreams);
        return this;
    }
    serialize() {
        return this.pipes.map((t) => t.serialize()).join(';');
    }
}
