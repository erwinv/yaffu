import { strict as assert } from 'node:assert'
import { unlink } from 'node:fs/promises'

export function noop() {
  // do nothing
}

export function* _range(n: number, start = 0) {
  if (n < 1) return

  for (let i = start; i < start + n; i++) {
    yield i
  }
}

export function range(...args: Parameters<typeof _range>) {
  return [..._range(...args)]
}

export function* monotonicId(prefix = '') {
  for (const x of _range(Number.POSITIVE_INFINITY)) {
    yield `${prefix}${x}`
  }
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
    })(),
  )
}

export function isEqualSet<T>(xs: Set<T>, ys: Set<T>) {
  return xs.size === ys.size && setDiff(xs, ys).size === 0
}

export function stableReplace<T>(_prev: T[], _next: Iterable<T>): T[] {
  const prev = new Set(_prev)
  const next = new Set(_next)

  assert(Math.abs(prev.size - next.size) <= 1)

  const [removed] = setDiff(prev, next)
  const [added] = setDiff(next, prev)

  const i = _prev.indexOf(removed)
  if (!removed || i < 0) {
    return added ? [..._prev, added] : _prev
  }

  const ret = [..._prev]
  if (added) {
    ret.splice(i, 1, added)
  } else {
    ret.splice(i, 1)
  }
  return ret
}

export function partition<T>(xs: T[], predicate: (x: T) => boolean) {
  const pass: T[] = []
  const fail: T[] = []

  for (const x of xs) {
    if (predicate(x)) pass.push(x)
    else fail.push(x)
  }

  return [pass, fail] as [pass: T[], fail: T[]]
}

export function asyncNoThrow<Args extends readonly unknown[], R>(
  fn: (...args: Args) => Promise<R>,
) {
  return async (...args: Args) => fn(...args).catch(noop)
}

export const unlinkNoThrow = asyncNoThrow(unlink)
