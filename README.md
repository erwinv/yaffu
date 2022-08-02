# Yet Another FFmpeg Util

## Dependencies

- FFmpeg

## Install

```sh
npm install yaffu@latest
```

## Example

Run the `example/index.mjs` script which demos `genericCombine` (mixes all audio and stacks all video on a centered grid):

```
git clone https://github.com/erwinv/yaffu
cd yaffu/example
npm install
npm run test
```

Using `genericCombine` is as simple as:
```ts
import { ffmux, genericCombine } from 'yaffu'

const inputPaths = [
  //...
]
await ffmux(genericCombine(inputPaths, 'combined.mp4'))
```

## API

### High-level API

- `mixAudio` downmixes and mixes all input audio to stereo
- `compositeGrid` stacks all video input on a grid layout (max 16 or 4x4 grid)
- `compositePresentation` main tile (presentation) on the left, vertically stacked tiles on the right (max 4)
- `genericCombine` is a convenient wrapper that does both `mixAudio` and `compositeGrid`

### Low-level API

- `FilterGraph` filter graph builder class
- `ffmux` executes the filter graph and muxes to the defined output
- `ffconcatDemux` concatenates all input files using FFmpeg's concat demuxer
- `ffprobe` probe media file's metadata

```ts
import { FilterGraph, ffmux } from 'yaffu'

const inputPaths = [
  //...
]

const graph = new FilterGraph(inputPaths)

// build filter graph by piping streams through filters to output streams
graph
  .pipe(['0:a', '1:a'], ['aout']) // input stream ids, output stream ids
  .filter('amix', [], { normalize: 0 }) // filter name, direct options, key-value options
  .filter('dynaudnorm') // filter with no opts (use default opts)

// map stream/s to output file
graph.map(['aout'], 'output.aac')

// run the muxer
await ffmux(graph)
```
