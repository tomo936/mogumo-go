import { expect, test } from 'vitest'
import { pinLayout } from './pins.ts'

test('3軒・ズーム17は3つで、中央が一番高い', () => {
  const r = pinLayout(3, 17, false)
  if (r === 'collapsed') throw new Error('collapsed')
  expect(r.pins.map((p) => p.x)).toEqual([-34, 0, 34])
  expect(r.pins[1].y).toBeLessThan(r.pins[0].y)
  expect(r.pins[0].y).toBe(r.pins[2].y)
  expect(r.more).toBe(0)
})

test('ズーム15.9は collapsed', () => {
  expect(pinLayout(3, 15.9, false)).toBe('collapsed')
})

test('小さいビルに8軒なら5つ並べて残り3', () => {
  const r = pinLayout(8, 19, false)
  if (r === 'collapsed') throw new Error('collapsed')
  expect(r.pins).toHaveLength(5)
  expect(r.more).toBe(3)
})

test('大型の施設は2軒でもズーム19でも collapsed', () => {
  expect(pinLayout(2, 19, true)).toBe('collapsed')
})
