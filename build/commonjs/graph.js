"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FilterGraph = exports.Pipe = exports.Filter = exports.VideoStream = exports.AudioStream = exports.BaseStream = void 0;
const lodash_es_1 = require("lodash-es");
const path_1 = require("path");
const codec_js_1 = require("./codec.js");
class BaseStream {
    constructor(id) {
        this.id = id;
    }
}
exports.BaseStream = BaseStream;
class AudioStream extends BaseStream {
    serialize() {
        if (!this.codec)
            throw new Error(`Not an output stream: [${this.id}]`);
        return [
            `-map "[${this.id}]"`,
            `-c:a ${codec_js_1.ENCODER[this.codec]}`,
            ...codec_js_1.ENCODER_OPTS[this.codec](),
        ].join(' ');
    }
}
exports.AudioStream = AudioStream;
class VideoStream extends BaseStream {
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
            `-c:v ${codec_js_1.ENCODER[this.codec]}`,
            ...codec_js_1.ENCODER_OPTS[this.codec](this.resolution),
            `-r ${this.framerate}`,
        ].join(' ');
    }
}
exports.VideoStream = VideoStream;
class Filter {
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
        const options = this.options.map((v) => ((0, lodash_es_1.isArray)(v) ? v.join('|') : `${v}`));
        const kvOptions = [...this.keyValOptions.entries()].map(([k, v]) => `${k}=${(0, lodash_es_1.isArray)(v) ? v.join('|') : v}`);
        return `${this.name}=` + [...options, ...kvOptions].join(':');
    }
}
exports.Filter = Filter;
class Pipe {
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
exports.Pipe = Pipe;
class FilterGraph {
    constructor(inputs) {
        this.inputs = [];
        this.outputs = new Map();
        this.pipes = [];
        this.audioStreams = new Set();
        this.videoStreams = new Set();
        for (const [i, input] of inputs.entries()) {
            const inputPath = (0, lodash_es_1.isString)(input) ? input : input[0];
            const inputOpts = (0, lodash_es_1.isString)(input) ? [] : input[1];
            this.inputs.push([inputPath, inputOpts]);
            const vidId = `${i}:v`;
            const audId = `${i}:a`;
            // TODO FIXME ffprobe?
            const inputExt = (0, path_1.extname)(inputPath);
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
        const outputExt = (0, path_1.extname)(outputPath);
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
exports.FilterGraph = FilterGraph;
