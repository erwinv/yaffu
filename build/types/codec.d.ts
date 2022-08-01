export declare type Resolution = '360p' | '720p' | '1080p';
export declare const ENCODER: {
    readonly aac: "aac";
    readonly h264: "libx264";
    readonly opus: "libopus";
    readonly vp8: "libvpx";
    readonly vp9: "libvpx-vp9";
};
export declare type Codec = keyof typeof ENCODER;
export declare const ENCODER_OPTS: Record<Codec, (res?: Resolution) => string[]>;
