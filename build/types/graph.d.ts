import { Codec, Resolution } from './codec.js';
export declare class BaseStream {
    id: string;
    codec?: Codec;
    constructor(id: string);
}
export declare class AudioStream extends BaseStream {
    serialize(): string;
}
export declare class VideoStream extends BaseStream {
    framerate: number;
    resolution: Resolution;
    serialize(): string;
}
declare type Stream = AudioStream | VideoStream;
export declare class Filter {
    name: string;
    options: unknown[];
    keyValOptions: Map<string, unknown>;
    constructor(name: string);
    opt(...values: unknown[]): this;
    set(key: string, value: unknown): this;
    serialize(): string;
}
export declare class Pipe {
    inputs: string[];
    outputs: string[];
    filters: Filter[];
    constructor(inputs: string[], outputs: string[]);
    filter(name: string, opts?: unknown[], kvOpts?: Record<string, unknown>): this;
    filterIf(condition: boolean, name: string, opts?: unknown[], kvOpts?: Record<string, unknown>): this;
    serialize(): string;
}
export declare class FilterGraph {
    inputs: Array<[string, string[]]>;
    outputs: Map<string, Stream[]>;
    pipes: Pipe[];
    audioStreams: Set<string>;
    videoStreams: Set<string>;
    constructor(inputs: string[] | [string, string[]][]);
    get streams(): Set<string>;
    pipe(streamIds: string[], outputStreamIds: string[]): Pipe;
    map(streamIds: string[], outputPath: string): this;
    serialize(): string;
}
export {};
