import { noop } from 'lodash-es'
import { unlink } from 'fs/promises'

export function asyncNoThrow<Args extends readonly unknown[], R>(
  fn: (...args: Args) => Promise<R>
) {
  return async (...args: Args) => fn(...args).catch(noop)
}

export const unlinkNoThrow = asyncNoThrow(unlink)
