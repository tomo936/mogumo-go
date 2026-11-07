import { expect, test } from 'vitest'
import { cuteHeight, doorPoint, facilityParts, floors, stationIn } from './facility.ts'

const rect = (cx: number, cy: number, w: number, h: number) => [
  { x: cx - w / 2, y: cy - h / 2 },
  { x: cx + w / 2, y: cy - h / 2 },
  { x: cx + w / 2, y: cy + h / 2 },
  { x: cx - w / 2, y: cy + h / 2 },
  { x: cx - w / 2, y: cy - h / 2 },
]

test('重なる輪郭は入り、離れた輪郭は入らない（最初が main）', () => {
  const rings = [rect(100, 0, 10, 10), rect(0, 0, 60, 40), rect(25, 0, 20, 20)]
  const parts = facilityParts(1, rings, [10, 20, 30])
  expect(parts.map((p) => p.pts)).toEqual([rings[1], rings[2]])
})

test('辺だけが交わる（頂点がどちらの中にも無い）輪郭も入る', () => {
  const plus = [rect(0, 0, 60, 10), rect(0, 0, 10, 60)]
  expect(facilityParts(0, plus, [20, 20])).toHaveLength(2)
})

test('高さは 0.5 倍で 6〜30 に収まる', () => {
  expect(cuteHeight(4)).toBe(6)
  expect(cuteHeight(30)).toBe(15)
  expect(cuteHeight(200)).toBe(30)
})

test('同じ高さの2枚は 0.05m ずれる', () => {
  const parts = facilityParts(0, [rect(0, 0, 60, 40), rect(20, 0, 30, 30)], [20, 20])
  expect(parts.map((p) => p.heightM)).toEqual([10, 10.05])
})

test('floors(10)=3、低くても1', () => {
  expect(floors(10)).toBe(3)
  expect(floors(1)).toBe(1)
})

test('駅の点が部分の中なら返し、外なら null', () => {
  const parts = facilityParts(0, [rect(0, 0, 60, 40)], [20])
  expect(stationIn(parts, [{ x: 100, y: 0 }, { x: 5, y: 5 }])).toEqual({ x: 5, y: 5 })
  expect(stationIn(parts, [{ x: 100, y: 0 }])).toBeNull()
})

test('入口は真ん中から正面の向きへ進んで輪郭を出た所', () => {
  const d = doorPoint({ x: 0, y: 0 }, 180, rect(0, 0, 60, 40)) // 南向き → 南の辺（y=-20）
  expect(d.x).toBeCloseTo(0, 5)
  expect(d.y).toBeCloseTo(-20, 0)
})

test('main の3倍より広い重なりの輪郭（隣の巨大な輪郭）は入れない', () => {
  const parts = facilityParts(0, [rect(0, 0, 60, 40), rect(50, 0, 200, 200), rect(25, 0, 20, 20)], [20, 20, 30])
  expect(parts).toHaveLength(2)
  expect(parts[1].pts).toEqual(rect(25, 0, 20, 20))
})
