# Yet Another FFmpeg Util

## Usage

### High-level API
`genericCombine` mixes all audio and stacks all videos on a centered rectangular grid:
```ts
import {ffmux, genericCombine} from 'yaffu'

const inputPaths = [
  //...
]
await ffmux(genericCombine(inputPaths, 'combined.mp4'))
```

See `script/example.ts` for a demo of combining videos into a grid of 1-16 tiles. Run the example through:
```
npm install
npm run build
node ./build/esm/script/example.js
```

### Low-level API

```ts
import {FilterGraph, ffmux} from 'yaffu'

const inputPaths = [
  //...
]

const graph = new FilterGraph(inputPaths)

// build filter graph by piping streams through filters to output streams
graph.pipe(['0:a', '1:a'], ['aout']) // input stream ids, output stream ids
  .filter('amix', [], { normalize: 0}) // filter name, direct options, key-value options
  .filter('dynaudnorm') // filter with no opts (use default opts)

// map stream/s to output file
graph.map(['aout'], 'output.aac')

// run the muxer
await ffmux(graph)
```

See how `FilterGraph` is used in the generic `mixAudio` and `compositeGrid` high-level APIs in `lib/api.ts`.
