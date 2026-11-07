import { expect, test } from 'vitest'
import { pinLayout } from './pins.ts'

test('3軒・ズーム17は3つで、中央が一番高い', () => {
  const r = pinLayout(3, 17)
  if (r === 'collapsed') throw new Error('collapsed')
  expect(r.map((p) => p.x)).toEqual([-34, 0, 34])
  expect(r[1].y).toBeLessThan(r[0].y)
  expect(r[0].y).toBe(r[2].y)
})

test('ズーム15.9は collapsed', () => {
  expect(pinLayout(3, 15.9)).toBe('collapsed')
})

test('6軒はズーム19でも collapsed', () => {
  expect(pinLayout(6, 19)).toBe('collapsed')
})
