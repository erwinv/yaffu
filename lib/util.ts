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

export function* _take<T>(xs: Iterable<T>, n: number) {
  for (const x of xs) {
    if (n-- > 0) yield x
    else break
  }
}

export function take<T>(...args: Parameters<typeof _take<T>>) {
  return [..._take(...args)]
}

export function takeRight<T>(xs: Iterable<T>, n: number) {
  return [...xs].slice(-n)
}

export function isArray<T>(x: T | T[]): x is Array<T> {
  return x instanceof Array
}

export function isString(x: unknown): x is string {
  return typeof x === 'string'
}

export function setDiff<T>(xs: Set<T>, ys: Set<T>) {
  return new Set(
    (function* () {
      for (const x of xs) {
        if (!ys.has(x)) yield x
      }
    })()
  )
}

export function isEqualSet<T>(xs: Set<T>, ys: Set<T>) {
  return xs.size === ys.size && setDiff(xs, ys).size === 0
}

export function asyncNoThrow<Args extends readonly unknown[], R>(
  fn: (...args: Args) => Promise<R>
) {
  return async (...args: Args) => fn(...args).catch(noop)
}

export const unlinkNoThrow = asyncNoThrow(unlink)
