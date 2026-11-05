import { expect, test } from 'vitest'
import { nextBearing } from './rotate.ts'

test('360度をまたいで右に回る', () => {
  expect(nextBearing(350, 100)).toBeCloseTo(20)
})

test('0度をまたいで左に回る', () => {
  expect(nextBearing(10, -100)).toBeCloseTo(340)
})

test('動かさなければそのまま', () => {
  expect(nextBearing(0, 0)).toBe(0)
})
