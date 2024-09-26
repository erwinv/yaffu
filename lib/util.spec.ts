import { expect, test } from 'vitest'
import { _range, noop, range } from './util.js'

test('noop', () => {
  expect(noop()).toBe(undefined)
})

test('_range', () => {
  const start = 12
  let expected = start
  for (const i of _range(60, start)) {
    expect(i).toStrictEqual(expected++)
  }
})

test('range', () => {
  const start = 12
  const N = 60
  expect(range(N, start)).toEqual(
    Array(N)
      .fill(null)
      .map((_, i) => i + start),
  )
})
