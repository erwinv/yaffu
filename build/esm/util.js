import { noop } from 'lodash-es';
import { unlink } from 'fs/promises';
export function asyncNoThrow(fn) {
    return async (...args) => fn(...args).catch(noop);
}
export const unlinkNoThrow = asyncNoThrow(unlink);
