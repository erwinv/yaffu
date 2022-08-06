import { strict as assert } from 'assert'
import { range, take } from './util.js'
import { FilterGraph } from './graph.js'
import { InputClip } from './timeline.js'
import { Participant, Track } from './timeline.js'
import { mux } from './ffmpeg.js'

export async function genericCombine(
  inputs: Array<string | InputClip>,
  outputPath: string
) {
  const graph = await new FilterGraph(inputs).init()
  compositeGrid(graph, ['out:v'])
  mixAudio(graph, ['out:a'])
  await mux(graph.map(['out:v', 'out:a'], outputPath))
}

export function mixAudio(
  graph: FilterGraph,
  outputIds: string[],
  delays: number[] = []
) {
  const normalizedIds = graph
    .pipeEach(graph.leafAudioStreams, (id) => `${id}:norm`)
    .buildEach((pipe, i) => {
      const delay = delays[i] ?? 0

      const isRawAudioStream = graph.rootAudioStreams.has(pipe.inputs[i])
      pipe
        .filterIf(isRawAudioStream, 'aresample', [48000], { async: 1 })
        .filterIf(isRawAudioStream, 'pan', [
          [
            'stereo',
            'FL<FL+0.5*FC+0.6*BL+0.6*SL',
            'FR<FR+0.5*FC+0.6*BR+0.6*SR',
          ],
        ])
        .filter('asetpts', ['N/SR/TB'])
        .filterIf(delay > 0, 'adelay', [delay], { all: 1 })
    })

  graph
    .pipe(normalizedIds, outputIds)
    .filter('amix', [], { inputs: normalizedIds.length, normalize: 0 })
    .filter('dynaudnorm')
    .filterIf(outputIds.length > 1, 'asplit', [outputIds.length])
}

export function compositeGrid(graph: FilterGraph, outputIds: string[]) {
  const n = graph.leafVideoStreams.size
  assert(1 <= n && n <= 16, `Invalid # of video streams (< 1 OR > 16): ${n}`)

  const numRows = Math.round(Math.sqrt(n))
  const numCols = Math.ceil(n / numRows)

  const numFullRows = Math.floor(n / numCols)
  const numTilesOnTopGrid = numFullRows * numCols
  const numTilesOnBottomRow = n % numCols

  const width = 1920
  const height = 1080
  const tileWidth = width / numCols
  const tileHeight = height / numCols

  const tileIds = graph
    .pipeEach(graph.leafVideoStreams, (id) => `${id}:tile`)
    .buildEach((pipe, i) => {
      const isRawVideoStream = graph.rootVideoStreams.has(pipe.inputs[i])
      pipe
        .filter('setpts', ['PTS-STARTPTS'])
        .filterIf(isRawVideoStream, 'format', ['yuv420p'])
        .filter('scale', [tileWidth, tileHeight], {
          force_original_aspect_ratio: 'increase',
        })
        .filter('crop', [tileWidth, tileHeight])
    })

  if (numTilesOnTopGrid > 1) {
    const gridTilesIds = take(tileIds, numTilesOnTopGrid)
    const gridTilesLayout = range(numFullRows).flatMap((i) => {
      const y =
        i === 0
          ? '0'
          : range(i)
              .map(() => 'h0')
              .join('+')
      const xs = range(numCols).map((j) => {
        return j === 0
          ? '0'
          : range(j)
              .map(() => 'w0')
              .join('+')
      })
      return xs.map((x) => `${x}_${y}`)
    })
    graph.pipe(gridTilesIds, ['grid']).filter('xstack', [], {
      inputs: numTilesOnTopGrid,
      layout: gridTilesLayout,
      fill: 'black',
      shortest: 1,
    })
  }

  if (numTilesOnBottomRow > 0) {
    const botRowTilesIds = range(numTilesOnBottomRow).map(
      (i) => tileIds[numTilesOnTopGrid + i]
    )
    graph
      .pipe(botRowTilesIds, ['botrow'])
      .filterIf(numTilesOnBottomRow > 1, 'hstack', [], {
        inputs: numTilesOnBottomRow,
        shortest: 1,
      })
      .filter('pad', [width, 'ih', -1, -1])

    graph
      .pipe(['grid', 'botrow'], outputIds)
      .filter('vstack', [], { shortest: 1 })
      .filterIf(numFullRows + 1 < numCols, 'pad', ['iw', height, -1, -1])
      .filterIf(outputIds.length > 1, 'split', [outputIds.length])
  } else {
    const grid = numTilesOnTopGrid > 1 ? 'grid' : tileIds[0]
    graph
      .pipe([grid], outputIds)
      .filter('pad', ['iw', height, -1, -1])
      .filterIf(outputIds.length > 1, 'split', [outputIds.length])
  }
}

export function compositePresentation(
  graph: FilterGraph,
  outputIds: string[],
  mainId?: string
) {
  let othersIds: string[]
  if (mainId) {
    assert(
      graph.leafVideoStreams.has(mainId),
      `Not a leaf video stream: [${mainId}]`
    )
    const others = new Set(graph.leafVideoStreams)
    others.delete(mainId)
    othersIds = [...others]
  } else {
    ;[mainId, ...othersIds] = graph.leafVideoStreams
  }

  const nOthers = othersIds.length
  assert(nOthers <= 4, `Invalid # of video srteams (> 4): ${nOthers}`)

  if (nOthers === 0) {
    const isRawVideoStream = graph.rootVideoStreams.has(mainId)
    graph
      .pipe([mainId], outputIds)
      .filter('setpts', ['PTS-STARTPTS'])
      .filterIf(isRawVideoStream, 'format', ['yuv420p'])
      .filter('scale', [1920, 1080], {
        force_original_aspect_ratio: 'decrease',
      })
      .filter('pad', [1920, 1080, -1, -1])
      .filterIf(outputIds.length > 1, 'split', [outputIds.length])
    return
  }

  const mainTileWidth = (1920 * 3) / 4
  const mainTileHeight = 1080
  const tileWidth = 1920 / 4
  const tileHeight = 1080 / 4

  const mainTileId = 'main'
  const rightPanelId = 'rightpanel'

  const isRawVideoStream = graph.rootVideoStreams.has(mainId)
  graph
    .pipe([mainId], [mainTileId])
    .filter('setpts', ['PTS-STARTPTS'])
    .filterIf(isRawVideoStream, 'format', ['yuv420p'])
    .filter('scale', [mainTileWidth, mainTileHeight], {
      force_original_aspect_ratio: 'decrease',
    })
    .filter('pad', [mainTileWidth, mainTileHeight, -1, -1])

  const tileIds = graph
    .pipeEach(othersIds, (id) => `${id}:tile`)
    .buildEach((pipe, i) => {
      const isRawVideoStream = graph.rootVideoStreams.has(pipe.inputs[i])
      pipe
        .filter('setpts', ['PTS-STARTPTS'])
        .filterIf(isRawVideoStream, 'format', ['yuv420p'])
        .filter('scale', [tileWidth, tileHeight], {
          force_original_aspect_ratio: 'increase',
        })
        .filter('crop', [tileWidth, tileHeight])
    })

  graph
    .pipe(tileIds, [rightPanelId])
    .filterIf(nOthers > 1, 'vstack', [], { inputs: nOthers })
    .filterIf(nOthers < 4, 'pad', ['iw', 1080, -1, -1])

  graph
    .pipe([mainTileId, rightPanelId], outputIds)
    .filter('hstack')
    .filterIf(outputIds.length > 1, 'split', [outputIds.length])
}

export function renderParticipantVideoTrack(
  graph: FilterGraph,
  outputId: string,
  track: Track,
  participant?: Participant
) {
  const uid = participant?.id ?? 'anon'
  const name = participant?.name ?? ''
  const vidIds = track.cuts.map((clip) => clip.streamId)

  // normalize, trim, and delay clips
  const camIds = graph
    .pipeEach(vidIds, (id) => `${uid}:${id}:cam`)
    .buildEach((pipe, i) => {
      const clip = track.cuts[i]
      const trimStart = clip.trim?.start ?? 0
      const trimEnd = clip.trim?.end ?? Infinity
      const delay = clip.delay ?? 0
      const isRawVideoStream = graph.rootVideoStreams.has(pipe.inputs[i])
      pipe
        .filterIf(trimStart > 0, 'trim', [], {
          start: trimStart / 1000,
        })
        .filterIf(trimEnd < Infinity, 'trim', [], {
          end: trimEnd / 1000,
        })
        .filter('setpts', ['PTS-STARTPTS'])
        .filterIf(isRawVideoStream, 'format', ['yuv420p'])
        .filter('scale', [1280, 720], {
          force_original_aspect_ratio: 'increase',
        })
        .filter('crop', [1280, 720])
        .filterIf(name.length > 0, 'drawtext', [], {
          text: name,
          x: 24,
          y: 'h-text_h-12',
          fontcolor: 'white',
          fontsize: 60,
        })
        .filterIf(delay > 0, 'tpad', [], { start_duration: delay / 1000 })
    })

  // generate thumbnail
  const thumbId = camIds.length > 0 ? `${uid}:thumb` : outputId
  graph
    .pipe([], [thumbId], 'video')
    .filter('color', [], {
      size: `${1280 - 16}x${720 - 8}`, // for border
      color: '0x63666A',
      duration: track.duration / 1000,
    })
    .filterIf(name.length > 0, 'drawtext', [], {
      text: name,
      x: '(w-text_w)/2',
      y: '(h-text_h)/2',
      fontcolor: '0xF2E9EA',
      fontsize: 60,
    })
    .filter('pad', [1280, 720, -1, -1, 'black']) // border

  // overlay clips to thumbnail
  graph
    .pipeFoldLeft(camIds, (id) => `${id}:ovl`, outputId, thumbId)
    .build((pipe, i) => {
      const delay = track.cuts[i].delay ?? 0
      pipe.filter('overlay', [], {
        enable: `'gte(t,${delay / 1000})'`,
        eof_action: 'pass',
      })
    })
}

export function renderBlackScreen(
  graph: FilterGraph,
  outputIds: string[],
  duration: number
) {
  graph.pipe([], outputIds, 'video').filter('color', [], {
    size: `${1920}x${1080}`,
    color: 'black',
    duration: duration / 1000,
  })
}
