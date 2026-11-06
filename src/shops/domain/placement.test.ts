import { expect, test } from 'vitest'
import { placeShop } from './placement.ts'

const rect = (cx: number, cy: number, w: number, h: number) => [
  { x: cx - w / 2, y: cy - h / 2 },
  { x: cx - w / 2, y: cy + h / 2 },
  { x: cx + w / 2, y: cy + h / 2 },
  { x: cx + w / 2, y: cy - h / 2 },
  { x: cx - w / 2, y: cy - h / 2 },
]
const roadNorth = [[{ x: -50, y: 15 }, { x: 50, y: 15 }]]

test('輪郭あり: 中心・道路向き・小さい辺を切り上げ', () => {
  const r = placeShop(roadNorth, [rect(2, -1, 20, 12)])
  expect(r.onFootprint).toBe(true)
  expect(r.center.x).toBeCloseTo(2, 1)
  expect(r.center.y).toBeCloseTo(-1, 1)
  expect(Math.abs(r.facingDeg)).toBeLessThan(1)
  expect(r.sizeM).toBe(14)
})

test('大きな輪郭は 30 に切り下げ', () => {
  expect(placeShop(roadNorth, [rect(0, 0, 60, 50)]).sizeM).toBe(30)
})

test('輪郭なし: 東 5m の道路に向き、道路から下がる', () => {
  const r = placeShop([[{ x: 5, y: -50 }, { x: 5, y: 50 }]], [])
  expect(r.onFootprint).toBe(false)
  expect(r.facingDeg).toBeCloseTo(90, 0)
  expect(r.center.x).toBeCloseTo(-6, 1)
})

test('輪郭なし・道路なしでも例外なし', () => {
  const r = placeShop([], [])
  expect(r).toEqual({ center: { x: 0, y: 0 }, facingDeg: 180, sizeM: 14, onFootprint: false })
})

test('逆回りの輪郭でも同じ結果', () => {
  const a = placeShop(roadNorth, [rect(2, -1, 20, 12)])
  const b = placeShop(roadNorth, [rect(2, -1, 20, 12).reverse()])
  expect(b).toEqual(a)
})

test('原点を含まない輪郭は無視', () => {
  expect(placeShop(roadNorth, [rect(100, 100, 20, 12)]).onFootprint).toBe(false)
})
