# yaffu - Yet Another FFmpeg Util

Programmatically combine videos into a merged output with a dynamic layout.

![grid](https://github.com/erwinv/yaffu/assets/1235980/80221643-45b8-4df3-a6bf-98cc243d2854)

## Dependencies

- FFmpeg

## Install

```sh
npm install yaffu@latest
```

## Example

Run the `example/grid.js` script which demos `genericCombine` (mixes all audio and stacks all video on a centered grid):

```
git clone https://github.com/erwinv/yaffu
cd yaffu

corepack enable
corepack install

# build modules
pnnpm install
pnpm build

# run examples
cd example
pnpm install
node grid.js
```

Output (1080p)

https://github.com/erwinv/yaffu/assets/1235980/4523aca7-e1ea-48d0-9913-081ce9996433

Using `genericCombine` is as simple as:

```ts
import { ffmux, genericCombine } from 'yaffu'

const inputPaths = [
  //...
]
await ffmux(genericCombine(inputPaths, 'combined.mp4'))
```

## Timeline Example

Suppose audio/video inputs are given with the following timeline:
```
        0    5    10   15   20   25   30   35   40   45   50   55   60   65   70   75   80
--------|----|----|----|----|----|----|----|----|----|----|----|----|----|----|----|----|----|----|--
alice        [===========]                 [=======================================]
bob             [===========]                   [========================]                           
charlie            [===========]                     [==============]                                
david                 [===========]                       [====]                                     
screen                                [=======================================]                      
```

See `example/timeline.js` to see how to encode the above timeline using the API.

Output (720p)

https://github.com/erwinv/yaffu/assets/1235980/ad6e7a41-a0ad-46f5-a7a4-5e30a07ec0c3

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
