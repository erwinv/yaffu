import _ from 'lodash-es'
import { FilterGraph } from './filter.mjs'

export async function mixAudio(
  graph: FilterGraph,
  outputKeys: string[],
  delays: number[] = []
) {
  const audioKeys = graph.getLeafStreams('audio')

  for (const [i, audioKey] of audioKeys.entries()) {
    const delay = delays[i] ?? 0
    graph
      .transform([audioKey], [`rec${i}`])
      .filter('aresample', [48000], { async: 1 })
      .filter('pan', [
        ['stereo', 'FL<FL+0.5*FC+0.6*BL+0.6*SL', 'FR<FR+0.5*FC+0.6*BR+0.6*SR'],
      ])
      .filter('asetpts', ['N/SR/TB'])
      .filterIf(delay > 0, 'adelay', [delay], { all: 1 })
  }

  const recKeys = _.range(audioKeys.length).map((i) => `rec${i}`)
  graph
    .transform(recKeys, outputKeys)
    .filter('amix', [], { inputs: recKeys.length, normalize: 0 })
    .filter('dynaudnorm')
    .filterIf(
      outputKeys.length > 1,
      'asplit',
      outputKeys.length > 2 ? [outputKeys.length] : []
    )
}

export async function renderCamWithThumbnail(
  graph: FilterGraph,
  outputKey: string
) {
  // TODO generalize n=0..N
  const [v0, v1, v2] = graph.getLeafStreams('video')
  graph
    .transform([v0], ['cam0'])
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
    .transform([v1], ['cam1'])
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
    .transform([v2], ['cam2'])
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
    .transform([], ['thumb'])
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

  graph.transform(['thumb', 'cam0'], ['ovl0']).filter('overlay', [], {
    enable: `'gte(t,2)'`,
    eof_action: 'pass',
  })
  graph.transform(['ovl0', 'cam1'], ['ovl1']).filter('overlay', [], {
    enable: `'gte(t,6)'`,
    eof_action: 'pass',
  })
  graph.transform(['ovl1', 'cam2'], [outputKey]).filter('overlay', [], {
    enable: `'gte(t,10)'`,
    eof_action: 'pass',
  })
}

export async function renderGrid(graph: FilterGraph, outputKey: string) {
  const vidKeys = graph.getLeafStreams('video')
  const n = vidKeys.length
  if (n > 16) throw new Error()

  const numRows = Math.round(Math.sqrt(n))
  const numCols = Math.ceil(n / numRows)

  const numFullRows = Math.floor(n / numCols)
  const numTilesOnTopGrid = numFullRows * numCols
  const numTilesOnBottomRow = n % numCols

  const tileWidth = 1920 / numCols
  const tileHeight = 1080 / numCols

  for (const [i, vidKey] of vidKeys.entries()) {
    graph
      .transform([vidKey], [`tile${i}`])
      .filter('setpts', ['PTS-STARTPTS'])
      .filter('format', ['yuv420p'])
      .filter('scale', [tileWidth, tileHeight], {
        force_original_aspect_ratio: 'increase',
      })
      .filter('crop', [tileWidth, tileHeight])
  }

  const gridTilesKeys = _.range(numTilesOnTopGrid).map((i) => `tile${i}`)
  const gridTilesLayout = _.range(numFullRows).flatMap((i) => {
    const y =
      i === 0
        ? '0'
        : _.range(i)
            .map(() => 'h0')
            .join('+')
    const xs = _.range(numCols).map((j) => {
      return j === 0
        ? '0'
        : _.range(j)
            .map(() => 'w0')
            .join('+')
    })
    return xs.map((x) => `${x}_${y}`)
  })
  if (numTilesOnTopGrid > 1) {
    graph.transform(gridTilesKeys, ['grid']).filter('xstack', [], {
      inputs: numTilesOnTopGrid,
      fill: 'black',
      layout: gridTilesLayout,
    })
  }

  if (numTilesOnBottomRow > 0) {
    const botRowTilesKeys = _.range(numTilesOnBottomRow).map(
      (i) => `tile${numTilesOnTopGrid + i}`
    )
    graph
      .transform(botRowTilesKeys, ['botrow'])
      .filterIf(numTilesOnBottomRow > 1, 'hstack', [], {
        inputs: numTilesOnBottomRow,
      })
      .filter('pad', [1920, 'ih', -1, -1])

    graph
      .transform(['grid', 'botrow'], [outputKey])
      .filter('vstack')
      .filterIf(numFullRows + 1 < numCols, 'pad', ['iw', 1080, -1, -1])
  } else {
    const grid = numTilesOnTopGrid > 1 ? 'grid' : 'tile0'
    graph.transform([grid], [outputKey]).filter('pad', ['iw', 1080, -1, -1])
  }
}

export async function renderPresentation(
  graph: FilterGraph,
  mainKey: string,
  othersKeys: string[],
  outputKey: string
) {
  const nOthers = othersKeys.length
  if (nOthers === 0 || nOthers > 4) throw new Error()

  const mainWidth = (1920 * 3) / 4
  const mainHeight = 1080
  const othersWidth = 1920 / 4
  const othersHeight = 1080 / 4

  graph
    .transform([mainKey], ['main'])
    .filter('setpts', ['PTS-STARTPTS'])
    .filter('format', ['yuv420p'])
    .filter('scale', [mainWidth, mainHeight], {
      force_original_aspect_ratio: 'decrease',
    })
    .filter('pad', [mainWidth, mainHeight, -1, -1])

  for (const [i, other] of othersKeys.entries()) {
    graph
      .transform([other], [`tile${i}`])
      .filter('setpts', ['PTS-STARTPTS'])
      .filter('format', ['yuv420p'])
      .filter('scale', [othersWidth, othersHeight], {
        force_original_aspect_ratio: 'increase',
      })
      .filter('crop', [othersWidth, othersHeight])
  }

  const tileKeys = _.range(nOthers).map((i) => `tile${i}`)
  graph
    .transform(tileKeys, ['rightpanel'])
    .filter('vstack', [], { inputs: nOthers })
    .filterIf(nOthers < 4, 'pad', ['iw', 1080, -1, -1])
  graph.transform(['main', 'rightpanel'], [outputKey]).filter('hstack')
}
