"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.mux = exports.concatDemux = exports.probe = exports.FFmpegError = void 0;
const console_1 = require("console");
const child_process_1 = require("child_process");
const promises_1 = require("fs/promises");
const path_1 = require("path");
const stream_1 = require("stream");
const util_js_1 = require("./util.js");
const console = new console_1.Console(process.stderr);
class FFmpegError extends Error {
    constructor(exitCode) {
        super(`FFmpeg exited with failure code: ${exitCode}`);
        this.exitCode = exitCode;
    }
}
exports.FFmpegError = FFmpegError;
async function probe(path, entry) {
    const ffprobe = (0, child_process_1.spawn)('ffprobe', [
        '-v error',
        `-show_entries ${entry}`,
        '-of default=noprint_wrappers=1:nokey=1',
        `"${path}"`,
    ], { shell: true, stdio: ['ignore', 'pipe', 'inherit'] });
    return new Promise((resolve, reject) => {
        const out = [];
        ffprobe.stdout.on('data', (chunk) => out.push(chunk.toString('utf8')));
        ffprobe.on('error', reject);
        ffprobe.on('close', (code) => {
            if (code !== 0)
                reject();
            else
                resolve(out.join('\n'));
        });
    });
}
exports.probe = probe;
async function concatDemux(clipPaths, outputPath) {
    const concatListPath = (0, path_1.join)((0, path_1.dirname)(outputPath), (0, path_1.basename)(outputPath, (0, path_1.extname)(outputPath)) + '_concatList.txt' // TODO FIXME use os.tmpdir()
    );
    await (0, promises_1.writeFile)(concatListPath, clipPaths.map((clipPath) => `file ${clipPath}`).join('\n'));
    const ffmpeg = (0, child_process_1.spawn)('ffmpeg', [
        '-v warning',
        ...(outputPath.endsWith('.mp4') ? ['-auto_convert 1'] : []),
        '-f concat',
        '-safe 0',
        `-i ${concatListPath}`,
        '-c copy',
        '-y',
        outputPath,
    ], { shell: true, stdio: ['ignore', process.stderr, 'inherit'] });
    try {
        await new Promise((resolve, reject) => {
            ffmpeg.on('error', reject);
            ffmpeg.on('close', (code) => {
                if (code !== 0)
                    reject(new FFmpegError(code ?? NaN));
                else
                    resolve();
            });
        });
        return outputPath;
    }
    catch (e) {
        await (0, util_js_1.unlinkNoThrow)(outputPath);
        throw e;
    }
    finally {
        await (0, util_js_1.unlinkNoThrow)(concatListPath);
    }
}
exports.concatDemux = concatDemux;
async function mux(graph, verbose = true) {
    if (graph.outputs.size === 0)
        throw new Error('No defined output/s');
    const inputs = graph.inputs;
    const outputs = [...graph.outputs.entries()];
    if (verbose) {
        console.dir(inputs.map(([inputPath]) => inputPath));
        console.dir([...graph.outputs.keys()]);
        console.dir(graph.pipes.map((p) => p.serialize()));
    }
    const ffmpeg = (0, child_process_1.spawn)('ffmpeg', [
        verbose ? '-hide_banner' : '-v warning',
        ...inputs.flatMap(([inputPath, inputOpts]) => [
            ...inputOpts,
            `-i "${inputPath}"`,
        ]),
        '-filter_complex_script pipe:',
        ...outputs.flatMap(([outputPath, streams]) => [
            ...streams.map((stream) => stream.serialize()),
            '-y',
            outputPath,
        ]),
    ], {
        shell: true,
        stdio: ['pipe', process.stderr, 'inherit'],
    });
    try {
        await new Promise((resolve, reject) => {
            ffmpeg.on('error', reject);
            ffmpeg.on('close', (code) => {
                if (code !== 0)
                    reject(new FFmpegError(code ?? NaN));
                else
                    resolve();
            });
            stream_1.Readable.from(graph.serialize()).pipe(ffmpeg.stdin);
        });
    }
    catch (e) {
        await Promise.all(outputs.map(([outputPath]) => (0, util_js_1.unlinkNoThrow)(outputPath)));
        throw e;
    }
}
exports.mux = mux;
