/// <reference types="node" resolution-mode="require"/>
export declare function asyncNoThrow<Args extends readonly unknown[], R>(fn: (...args: Args) => Promise<R>): (...args: Args) => Promise<void | R>;
export declare const unlinkNoThrow: (path: import("fs").PathLike) => Promise<void>;
