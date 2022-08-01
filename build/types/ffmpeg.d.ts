import { FilterGraph } from './graph.js';
export declare class FFmpegError extends Error {
    exitCode: number;
    constructor(exitCode: number);
}
export declare function probe(path: string, entry: string): Promise<string>;
export declare function concatDemux(clipPaths: string[], outputPath: string): Promise<string>;
export declare function mux(graph: FilterGraph, verbose?: boolean): Promise<void>;
