export type Resolution = '360p' | '720p' | '1080p'

function vp8EncodingOpts(resolution: Resolution) {
  switch (resolution) {
    case '360p':
      return (
        '-b:v 1M' +
        ' -g 240 -threads 4 -quality good -crf 14' +
        ' -c:v libvpx -auto-alt-ref 0'
      )
    case '720p':
      return (
        '-b:v 2M' +
        ' -g 240 -threads 8 -quality good -crf 10' +
        ' -c:v libvpx -auto-alt-ref 0'
      )
    case '1080p':
      return (
        '-b:v 4M' +
        ' -g 240 -threads 8 -quality good -crf 9' +
        ' -c:v libvpx -auto-alt-ref 0'
      )
  }
}

function vp9EncodingOpts(resolution: Resolution) {
  // https://developers.google.com/media/vp9/settings/vod#recommended_settings
  switch (resolution) {
    case '360p':
      return (
        '-b:v 276k -minrate 138k -maxrate 400k' +
        ' -tile-columns 1 -g 240 -threads 4 -quality good -crf 36 -speed 2 -row-mt 1' +
        ' -c:v libvpx-vp9'
      )
    case '720p':
      return (
        '-b:v 1024k -minrate 512k -maxrate 1485k' +
        ' -tile-columns 2 -g 240 -threads 8 -quality good -crf 32 -speed 2 -row-mt 1' +
        ' -c:v libvpx-vp9'
      )
    case '1080p':
      return (
        '-b:v 1800k -minrate 900k -maxrate 2610k' +
        ' -tile-columns 2 -g 240 -threads 8 -quality good -crf 31 -speed 2 -row-mt 1' +
        ' -c:v libvpx-vp9'
      )
  }
}

// TODO FIXME cleanup, change opts structure to string[]

export const ENCODER_OPTS = {
  aac: () => '-c:a aac -b:a 128k',
  h264: () => '-c:v libx264 -preset veryfast',
  opus: () => '-b:a 128k -c:a libopus',
  vp8: vp8EncodingOpts,
  vp9: vp9EncodingOpts,
}

export type Codec = keyof typeof ENCODER_OPTS
