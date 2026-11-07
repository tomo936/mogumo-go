import { expect, test } from 'vitest'
import { cuteHeight, doorPoint, dropSharedParts, facilityLabel, facilityParts, floors, heightAt, outerEdges, stationIn } from './facility.ts'

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

test('同じ高さの2枚は同じ高さのまま（ずらすと段差の線が見える。同じ色なのでちらつきは見えない）', () => {
  const parts = facilityParts(0, [rect(0, 0, 60, 40), rect(20, 0, 30, 30)], [20, 20])
  expect(parts.map((p) => p.heightM)).toEqual([10, 10])
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

test('ふちを付けるのは外側の辺だけ（ほかの部分の中に入っている辺は除く）', () => {
  // 左右に並んだ2枚（つなぎ目は x=0 で、少し重なっている）
  const parts = [{ pts: rect(-10, 0, 21, 10), heightM: 10 }, { pts: rect(10, 0, 21, 10), heightM: 10.05 }]
  const edges = outerEdges(parts)
  expect(edges).toHaveLength(6) // 4辺ずつのうち、相手の中に入っている内側の辺1本ずつを除く
  expect(edges.every((e) => Math.abs((e.a.x + e.b.x) / 2) > 0.6 || Math.abs(e.a.y) === 5)).toBe(true)
})

test('駅の点は本体（最初の部分）の中にあるときだけ駅。重なった別の部分の中なら数えない', () => {
  const parts = facilityParts(0, [rect(0, 0, 60, 40), rect(40, 0, 40, 40)], [20, 8])
  const marks = [{ p: { x: 55, y: 0 }, name: '経堂', kind: 'station' as const }]
  expect(facilityLabel(parts, marks, [])).toEqual({ kind: 'facility', name: null })
  expect(facilityLabel(parts, [{ ...marks[0], p: { x: 0, y: 0 } }], [])).toEqual({ kind: 'station', name: '経堂駅' })
})

test('真ん中が輪郭の外（コの字）で正面に壁があれば、外から入って出る所ではなく最初に出る所', () => {
  // コの字（北が開いた形）。真ん中 (0,0) はくぼみの中
  const u = [{ x: -20, y: -20 }, { x: 20, y: -20 }, { x: 20, y: 20 }, { x: 10, y: 20 }, { x: 10, y: -10 }, { x: -10, y: -10 }, { x: -10, y: 20 }, { x: -20, y: 20 }]
  const d = doorPoint({ x: 0, y: 0 }, 180, u) // 南へ: y=-10 で入り y=-20 で出る
  expect(d.y).toBeCloseTo(-20, 5)
  const n = doorPoint({ x: 0, y: -2 }, 0, u) // 北へ: 壁が無い → いちばん近い壁（y=-10 の辺）
  expect(n.y).toBeCloseTo(-10, 5)
  expect(n.x).toBeCloseTo(0, 5)
})

test('点の上の屋根の高さは、その点を含む部分のうちいちばん高いもの', () => {
  const parts = [{ pts: rect(0, 0, 60, 40), heightM: 10 }, { pts: rect(20, 0, 10, 10), heightM: 30 }]
  expect(heightAt(parts, { x: -20, y: 0 })).toBe(10)
  expect(heightAt(parts, { x: 20, y: 0 })).toBe(30)
  expect(heightAt(parts, { x: 500, y: 0 })).toBe(10)
})

test('ほかの施設の本体の輪郭や、先に出た施設の部分は描かない', () => {
  const a = { id: 'station', parts: [{ ring: 'A' }, { ring: 'B' }, { ring: 'C' }] }
  const b = { id: 'tower', parts: [{ ring: 'B' }] }
  const c = { id: 'other', parts: [{ ring: 'D' }, { ring: 'C' }] }
  const out = dropSharedParts([a, b, c], (r: string) => r)
  expect(out[0].parts.map((q) => q.ring)).toEqual(['A', 'C'])
  expect(out[1]).toBe(b)
  expect(out[2].parts.map((q) => q.ring)).toEqual(['D'])
})
