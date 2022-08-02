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
  const audioIds = [...graph.audioStreams]
  const normalizedIds = audioIds.map((id) => `${id}_norm`)

  for (const [i, audId] of audioIds.entries()) {
    const normId = normalizedIds[i]
    const delay = delays[i] ?? 0
    graph
      .pipe([audId], [normId])
      .filter('aresample', [48000], { async: 1 })
      .filter('pan', [
        ['stereo', 'FL<FL+0.5*FC+0.6*BL+0.6*SL', 'FR<FR+0.5*FC+0.6*BR+0.6*SR'],
      ])
      .filter('asetpts', ['N/SR/TB'])
      .filterIf(delay > 0, 'adelay', [delay], { all: 1 })
  }

  graph
    .pipe(normalizedIds, outputIds)
    .filter('amix', [], { inputs: normalizedIds.length, normalize: 0 })
    .filter('dynaudnorm')
    .filterIf(outputIds.length > 1, 'asplit', [outputIds.length])
}

export function compositeGrid(graph: FilterGraph, outputIds: string[]) {
  const videoIds = [...graph.videoStreams]
  const n = videoIds.length
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

  for (const [i, vidId] of videoIds.entries()) {
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

export function compositePresentation(graph: FilterGraph, outputIds: string[]) {
  const [mainId, ...othersIds] = [...graph.videoStreams]

  const nOthers = othersIds.length
  if (nOthers > 4)
    throw new Error(`Invalid # of video srteams (> 4): ${nOthers}`)

  if (nOthers === 0) {
    graph
      .pipe([mainId], outputIds)
      .filter('setpts', ['PTS-STARTPTS'])
      .filter('format', ['yuv420p'])
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
  const tileIds = othersIds.map((id) => `${id}_tile`)
  const rightPanelId = 'rightpanel'

  graph
    .pipe([mainId], [mainTileId])
    .filter('setpts', ['PTS-STARTPTS'])
    .filter('format', ['yuv420p'])
    .filter('scale', [mainTileWidth, mainTileHeight], {
      force_original_aspect_ratio: 'decrease',
    })
    .filter('pad', [mainTileWidth, mainTileHeight, -1, -1])

  for (const [i, otherId] of othersIds.entries()) {
    const tileId = tileIds[i]
    graph
      .pipe([otherId], [tileId])
      .filter('setpts', ['PTS-STARTPTS'])
      .filter('format', ['yuv420p'])
      .filter('scale', [tileWidth, tileHeight], {
        force_original_aspect_ratio: 'increase',
      })
      .filter('crop', [tileWidth, tileHeight])
  }

  graph
    .pipe(tileIds, [rightPanelId])
    .filterIf(nOthers > 1, 'vstack', [], { inputs: nOthers })
    .filterIf(nOthers < 4, 'pad', ['iw', 1080, -1, -1])

  graph
    .pipe([mainTileId, rightPanelId], outputIds)
    .filter('hstack')
    .filterIf(outputIds.length > 1, 'split', [outputIds.length])
}

interface ParticipantTrack {
  participant: {
    id: string
    name: string
  }
  duration: number
  clips: Array<{
    videoId: string
    trim?: {
      start: number
      end: number
    }
    delay?: number
  }>
}

export function renderParticipantTrack(
  graph: FilterGraph,
  outputId: string,
  track: ParticipantTrack
) {
  const uid = track.participant.id

  // normalize, trim, and delay clips
  const camIds = track.clips.map((_, i) => `u${uid}_cam${i}`)
  for (const [i, clip] of track.clips.entries()) {
    const vidId = clip.videoId
    const camId = camIds[i]
    const trimStart = clip.trim?.start ?? 0
    const trimEnd = clip.trim?.end ?? Infinity
    const delay = clip.delay ?? 0
    graph
      .pipe([vidId], [camId])
      .filterIf(trimStart > 0, 'trim', [], {
        start: trimStart / 1000,
      })
      .filterIf(trimEnd < Infinity, 'trim', [], {
        end: trimEnd / 1000,
      })
      .filter('setpts', ['PTS-STARTPTS'])
      .filter('format', ['yuv420p'])
      .filter('scale', [1280, 720], {
        force_original_aspect_ratio: 'increase',
      })
      .filter('crop', [1280, 720])
      .filterIf(delay > 0, 'tpad', [], { start_duration: delay / 1000 })
  }

  // generate thumbnail
  const thumbId = camIds.length > 0 ? `u${uid}_thumb` : outputId
  graph
    .pipe([], [thumbId], 'video')
    .filter('color', [], {
      size: `${1280 - 16}x${720 - 8}`, // for border
      color: '0x63666A',
      duration: track.duration / 1000,
    })
    .filter('drawtext', [], {
      text: track.participant.name,
      x: '(w-text_w)/2',
      y: '(h-text_h)/2',
      fontcolor: '0xF2E9EA',
      fontsize: 60,
    })
    .filter('pad', [1280, 720, -1, -1, 'black']) // border

  // overlay clips to thumbnail
  let prevOverlayId = thumbId
  for (const [i, camId] of camIds.entries()) {
    const nextOverlayId = i < camIds.length - 1 ? `${camId}_ovl` : outputId
    const delay = track.clips[i].delay ?? 0
    graph.pipe([prevOverlayId, camId], [nextOverlayId]).filter('overlay', [], {
      enable: `'gte(t,${delay / 1000})'`,
      eof_action: 'pass',
    })
    prevOverlayId = nextOverlayId
  }
}
