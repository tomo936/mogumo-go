import { expect, test } from 'vitest'
import { nearBox, tileBox } from './tileBox.ts'

test('tileBox: 経堂のタイル 14/14546/6453 は東の端が 139.6362 あたり、経堂の駅を含む', () => {
  const b = tileBox(14, 14546, 6453)
  expect(b.east).toBeCloseTo(139.63623, 4)
  expect(b.west).toBeLessThan(b.east)
  expect(b.south).toBeLessThan(b.north)
  expect(nearBox({ lat: 35.6512, lng: 139.6361 }, b, 0)).toBe(true)
})

test('nearBox: 範囲の外でも marginM 以内なら近い、それより遠ければ遠い', () => {
  const b = tileBox(14, 14546, 6453)
  const east = (m: number) => ({ lat: 35.6512, lng: b.east + m / (111195 * Math.cos((35.6512 * Math.PI) / 180)) })
  expect(nearBox(east(150), b, 200)).toBe(true)
  expect(nearBox(east(250), b, 200)).toBe(false)
})

test('tileBox: 0/0/0 は世界全体', () => {
  const b = tileBox(0, 0, 0)
  expect(b.west).toBe(-180)
  expect(b.east).toBe(180)
  expect(b.north).toBeCloseTo(85.0511, 3)
})
