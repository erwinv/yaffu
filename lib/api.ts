import { range } from './util.js'
import { FilterGraph } from './graph.js'

export function genericCombine(
  inputs: string[] | [string, string[]][],
  outputPath: string
) {
  const graph = new FilterGraph(inputs)
  compositeGrid(graph, ['vout'])
  mixAudio(graph, ['aout'])
  return graph.map(['vout', 'aout'], outputPath)
}

export function mixAudio(
  graph: FilterGraph,
  outputIds: string[],
  delays: number[] = []
) {
  const streamIds = [...graph.audioStreams]

  for (const [i, streamId] of streamIds.entries()) {
    const delay = delays[i] ?? 0
    graph
      .pipe([streamId], [`rec${i}`])
      .filter('aresample', [48000], { async: 1 })
      .filter('pan', [
        ['stereo', 'FL<FL+0.5*FC+0.6*BL+0.6*SL', 'FR<FR+0.5*FC+0.6*BR+0.6*SR'],
      ])
      .filter('asetpts', ['N/SR/TB'])
      .filterIf(delay > 0, 'adelay', [delay], { all: 1 })
  }

  const recIds = range(streamIds.length).map((i) => `rec${i}`)
  graph
    .pipe(recIds, outputIds)
    .filter('amix', [], { inputs: recIds.length, normalize: 0 })
    .filter('dynaudnorm')
    .filterIf(outputIds.length > 1, 'asplit', [outputIds.length])
}

export function renderCamWithThumbnail(graph: FilterGraph, outputId: string) {
  // TODO generalize n=0..N
  const [v0, v1, v2] = graph.videoStreams
  graph
    .pipe([v0], ['cam0'])
    .filter('trim', [], {
      start: 4,
      end: 6,
    })
    .filter('setpts', ['PTS-STARTPTS'])
    .filter('format', ['yuv420p'])
    .filter('scale', [1280, 720], {
      force_original_aspect_ratio: 'increase',
    })
    .filter('crop', [1280, 720])
    .filter('tpad', [], { start_duration: 2 })

  graph
    .pipe([v1], ['cam1'])
    .filter('trim', [], {
      start: 4,
      end: 6,
    })
    .filter('setpts', ['PTS-STARTPTS'])
    .filter('format', ['yuv420p'])
    .filter('scale', [1280, 720], {
      force_original_aspect_ratio: 'increase',
    })
    .filter('crop', [1280, 720])
    .filter('tpad', [], { start_duration: 6 })

  graph
    .pipe([v2], ['cam2'])
    .filter('trim', [], {
      start: 4,
      end: 6,
    })
    .filter('setpts', ['PTS-STARTPTS'])
    .filter('format', ['yuv420p'])
    .filter('scale', [1280, 720], { force_original_aspect_ratio: 'increase' })
    .filter('crop', [1280, 720])
    .filter('tpad', [], { start_duration: 10 })

  graph
    .pipe([], ['thumb'])
    .filter('color', [], {
      size: `${1280 - 16}x${720 - 8}`,
      color: '0x63666A',
      duration: 14,
    })
    .filter('drawtext', [], {
      text: `'Big Buck Bunny'`,
      x: '(w-text_w)/2',
      y: '(h-text_h)/2',
      fontcolor: '0xF2E9EA',
      fontsize: 60,
    })
    .filter('pad', [1280, 720, -1, -1, 'black'])

  graph.pipe(['thumb', 'cam0'], ['ovl0']).filter('overlay', [], {
    enable: `'gte(t,2)'`,
    eof_action: 'pass',
  })
  graph.pipe(['ovl0', 'cam1'], ['ovl1']).filter('overlay', [], {
    enable: `'gte(t,6)'`,
    eof_action: 'pass',
  })
  graph.pipe(['ovl1', 'cam2'], [outputId]).filter('overlay', [], {
    enable: `'gte(t,10)'`,
    eof_action: 'pass',
  })
}

export function compositeGrid(graph: FilterGraph, outputIds: string[]) {
  const vidIds = [...graph.videoStreams]
  const n = vidIds.length
  if (n < 1 || n > 16)
    throw new Error(`Invalid # of video streams (< 1 OR > 16): ${n}`)

  const numRows = Math.round(Math.sqrt(n))
  const numCols = Math.ceil(n / numRows)

  const numFullRows = Math.floor(n / numCols)
  const numTilesOnTopGrid = numFullRows * numCols
  const numTilesOnBottomRow = n % numCols

  const width = 1920
  const height = 1080
  const tileWidth = width / numCols
  const tileHeight = height / numCols

  for (const [i, vidId] of vidIds.entries()) {
    graph
      .pipe([vidId], [`tile${i}`])
      .filter('setpts', ['PTS-STARTPTS'])
      .filter('format', ['yuv420p'])
      .filter('scale', [tileWidth, tileHeight], {
        force_original_aspect_ratio: 'increase',
      })
      .filter('crop', [tileWidth, tileHeight])
  }

  const gridTilesIds = range(numTilesOnTopGrid).map((i) => `tile${i}`)
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
  if (numTilesOnTopGrid > 1) {
    graph.pipe(gridTilesIds, ['grid']).filter('xstack', [], {
      inputs: numTilesOnTopGrid,
      layout: gridTilesLayout,
      fill: 'black',
      shortest: 1,
    })
  }

  if (numTilesOnBottomRow > 0) {
    const botRowTilesIds = range(numTilesOnBottomRow).map(
      (i) => `tile${numTilesOnTopGrid + i}`
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
    const grid = numTilesOnTopGrid > 1 ? 'grid' : 'tile0'
    graph
      .pipe([grid], outputIds)
      .filter('pad', ['iw', height, -1, -1])
      .filterIf(outputIds.length > 1, 'split', [outputIds.length])
  }
}

export function compositePresentation(
  graph: FilterGraph,
  mainId: string,
  othersIds: string[],
  outputId: string
) {
  const nOthers = othersIds.length
  if (nOthers === 0 || nOthers > 4) throw new Error()

  const mainWidth = (1920 * 3) / 4
  const mainHeight = 1080
  const othersWidth = 1920 / 4
  const othersHeight = 1080 / 4

  graph
    .pipe([mainId], ['main'])
    .filter('setpts', ['PTS-STARTPTS'])
    .filter('format', ['yuv420p'])
    .filter('scale', [mainWidth, mainHeight], {
      force_original_aspect_ratio: 'decrease',
    })
    .filter('pad', [mainWidth, mainHeight, -1, -1])

  for (const [i, other] of othersIds.entries()) {
    graph
      .pipe([other], [`tile${i}`])
      .filter('setpts', ['PTS-STARTPTS'])
      .filter('format', ['yuv420p'])
      .filter('scale', [othersWidth, othersHeight], {
        force_original_aspect_ratio: 'increase',
      })
      .filter('crop', [othersWidth, othersHeight])
  }

  const tileIds = range(nOthers).map((i) => `tile${i}`)
  graph
    .pipe(tileIds, ['rightpanel'])
    .filter('vstack', [], { inputs: nOthers })
    .filterIf(nOthers < 4, 'pad', ['iw', 1080, -1, -1])
  graph.pipe(['main', 'rightpanel'], [outputId]).filter('hstack')
}
