function vp8Opts(resolution = '1080p') {
    switch (resolution) {
        case '360p':
            return [
                '-b:v 1M',
                '-g 240',
                '-threads 4',
                '-quality good',
                '-crf 14',
                '-auto-alt-ref 0',
            ];
        case '720p':
            return [
                '-b:v 2M',
                '-g 240',
                '-threads 8',
                '-quality good',
                '-crf 10',
                '-auto-alt-ref 0',
            ];
        case '1080p':
            return [
                '-b:v 4M',
                '-g 240',
                '-threads 8',
                '-quality good',
                '-crf 9',
                '-auto-alt-ref 0',
            ];
    }
}
function vp9Opts(resolution = '1080p') {
    // https://developers.google.com/media/vp9/settings/vod#recommended_settings
    switch (resolution) {
        case '360p':
            return [
                '-b:v 276k',
                '-minrate 138k',
                '-maxrate 400k',
                '-tile-columns 1',
                '-g 240',
                '-threads 4',
                '-quality good',
                '-crf 36',
                '-speed 2',
                '-row-mt 1',
            ];
        case '720p':
            return [
                '-b:v 1024k',
                '-minrate 512k',
                '-maxrate 1485k',
                '-tile-columns 2',
                '-g 240',
                '-threads 8',
                '-quality good',
                '-crf 32',
                '-speed 2',
                '-row-mt 1',
            ];
        case '1080p':
            return [
                '-b:v 1800k',
                '-minrate 900k',
                '-maxrate 2610k',
                '-tile-columns 2',
                '-g 240',
                '-threads 8',
                '-quality good',
                '-crf 31',
                '-speed 2',
                '-row-mt 1',
            ];
    }
}
export const ENCODER = {
    aac: 'aac',
    h264: 'libx264',
    opus: 'libopus',
    vp8: 'libvpx',
    vp9: 'libvpx-vp9',
};
export const ENCODER_OPTS = {
    aac: () => ['-b:a 128k'],
    h264: () => ['-preset veryfast'],
    opus: () => ['-b:a 128k'],
    vp8: vp8Opts,
    vp9: vp9Opts,
};
