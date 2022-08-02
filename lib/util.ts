import { unlink } from 'fs/promises'

export function noop() {} // eslint-disable-line @typescript-eslint/no-empty-function

export function* _range(n: number, start = 0) {
  if (n < 1) return

  for (let i = start; i < start + n; i++) {
    yield i
  }
}

export function range(...args: Parameters<typeof _range>) {
  return [..._range(...args)]
}

export function isArray<T>(x: T | T[]): x is Array<T> {
  return x instanceof Array
}

export function asyncNoThrow<Args extends readonly unknown[], R>(
  fn: (...args: Args) => Promise<R>
) {
  return async (...args: Args) => fn(...args).catch(noop)
}

export const unlinkNoThrow = asyncNoThrow(unlink)
