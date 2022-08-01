import { FilterGraph } from './graph.js';
export declare function genericCombine(inputs: string[] | [string, string[]][], outputPath: string): FilterGraph;
export declare function mixAudio(graph: FilterGraph, outputIds: string[], delays?: number[]): void;
export declare function renderCamWithThumbnail(graph: FilterGraph, outputId: string): void;
export declare function compositeGrid(graph: FilterGraph, outputIds: string[]): void;
export declare function compositePresentation(graph: FilterGraph, mainId: string, othersIds: string[], outputId: string): void;
