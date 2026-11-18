import { describe, expect, it } from 'vitest'
import { bboxOf, cellsInTown, inGeometry, inTown, isGeometry } from './shape.ts'
import type { Geometry } from './shape.ts'
import { CELL_DEG, cellCenter, cellKey } from '../../fog/domain/grid.ts'

// 左下 (lng, lat) から、東へ w マス・北へ h マスの四角（マスの境目にそろえる）
function rect(x: number, y: number, w: number, h: number): number[][] {
  const a = x * CELL_DEG.lng
  const b = y * CELL_DEG.lat
  const c = (x + w) * CELL_DEG.lng
  const d = (y + h) * CELL_DEG.lat
  return [[a, b], [c, b], [c, d], [a, d], [a, b]]
}
const X = 223000 // 東京のあたりのマス
const Y = 158500
const town = (geom: Geometry) => ({ geom, bbox: bboxOf(geom) })
const at = (x: number, y: number) => cellCenter({ x, y })

describe('bboxOf', () => {
  it('部品ぜんぶを囲む', () => {
    const g: Geometry = { type: 'MultiPolygon', coordinates: [[[[1, 2], [3, 2], [3, 4], [1, 2]]], [[[10, 20], [11, 20], [11, 22], [10, 20]]]] }
    expect(bboxOf(g)).toEqual([1, 2, 11, 22])
  })
})

describe('isGeometry', () => {
  it('Polygon と MultiPolygon だけ通す', () => {
    expect(isGeometry({ type: 'Polygon', coordinates: [rect(0, 0, 1, 1)] })).toBe(true)
    expect(isGeometry({ type: 'MultiPolygon', coordinates: [[rect(0, 0, 1, 1)]] })).toBe(true)
    expect(isGeometry({ type: 'Point', coordinates: [1, 2] })).toBe(false)
    expect(isGeometry({ type: 'Polygon', coordinates: [] })).toBe(false)
    expect(isGeometry({ type: 'Polygon', coordinates: [[['a', 1]]] })).toBe(false)
    expect(isGeometry(null)).toBe(false)
    expect(isGeometry('Polygon')).toBe(false)
  })
})

describe('inGeometry / inTown', () => {
  const g: Geometry = { type: 'Polygon', coordinates: [rect(X, Y, 10, 10), rect(X + 4, Y + 4, 2, 2)] }
  it('中は true・外は false・穴の中は false', () => {
    expect(inGeometry(g, at(X + 1, Y + 1))).toBe(true)
    expect(inGeometry(g, at(X + 11, Y + 1))).toBe(false)
    expect(inGeometry(g, at(X + 4, Y + 4))).toBe(false)
  })
  it('離れた部品のどちらかに入っていれば true', () => {
    const m: Geometry = { type: 'MultiPolygon', coordinates: [[rect(X, Y, 2, 2)], [rect(X + 100, Y, 2, 2)]] }
    expect(inGeometry(m, at(X + 100, Y))).toBe(true)
    expect(inGeometry(m, at(X + 50, Y))).toBe(false)
  })
  it('inTown は四角の外をすぐ外す（答えは同じ）', () => {
    expect(inTown(town(g), at(X + 1, Y + 1))).toBe(true)
    expect(inTown(town(g), at(X + 4, Y + 4))).toBe(false)
    expect(inTown(town(g), at(X + 500, Y))).toBe(false)
  })
})

describe('cellsInTown', () => {
  it('100m 四方（4×4 マス）の町は 16 マス', () => {
    const t = town({ type: 'Polygon', coordinates: [rect(X, Y, 4, 4)] })
    const cells = cellsInTown(t, at(X + 2, Y + 2), 2000)
    expect(cells).toHaveLength(16)
    const keys = new Set(cells.map(cellKey))
    expect(keys.has(cellKey({ x: X, y: Y }))).toBe(true)
    expect(keys.has(cellKey({ x: X + 3, y: Y + 3 }))).toBe(true)
    expect(keys.has(cellKey({ x: X + 4, y: Y }))).toBe(false)
  })
  it('穴の中のマスは入らない', () => {
    const t = town({ type: 'Polygon', coordinates: [rect(X, Y, 10, 10), rect(X + 4, Y + 4, 2, 2)] })
    const cells = cellsInTown(t, at(X + 5, Y + 5), 2000)
    expect(cells).toHaveLength(96)
    expect(cells.some((c) => c.x === X + 4 && c.y === Y + 4)).toBe(false)
  })
  it('1マスずつ調べた答えと同じ（ななめの形）', () => {
    const a = X * CELL_DEG.lng
    const b = Y * CELL_DEG.lat
    const g: Geometry = { type: 'Polygon', coordinates: [[[a, b], [a + 31.3 * CELL_DEG.lng, b + 4.2 * CELL_DEG.lat], [a + 12.7 * CELL_DEG.lng, b + 27.9 * CELL_DEG.lat], [a, b]]] }
    const t = town(g)
    const got = new Set(cellsInTown(t, at(X + 15, Y + 15), 5000).map(cellKey))
    const want = new Set<string>()
    for (let x = X - 2; x < X + 40; x++) for (let y = Y - 2; y < Y + 40; y++) if (inGeometry(g, at(x, y))) want.add(cellKey({ x, y }))
    expect(want.size).toBeGreaterThan(300)
    expect(got).toEqual(want)
  })
  it('広い町は、見えている四角の中だけマスにする', () => {
    // 東西 4,000 マス（100km）・南北 4,000 マスの町
    const t = town({ type: 'Polygon', coordinates: [rect(X - 2000, Y - 2000, 4000, 4000)] })
    const center = at(X, Y)
    const cells = cellsInTown(t, center, 500)
    // 半径 500m の四角 = およそ 40×40 マス
    expect(cells.length).toBeGreaterThan(1400)
    expect(cells.length).toBeLessThan(1800)
    for (const c of cells) {
      const p = cellCenter(c)
      expect(Math.abs(p.lat - center.lat)).toBeLessThanOrEqual(500 / 111195 + 1e-12)
    }
  })
  it('町が四角の外なら空。半径 0 も空', () => {
    const t = town({ type: 'Polygon', coordinates: [rect(X, Y, 4, 4)] })
    expect(cellsInTown(t, at(X + 1000, Y), 2000)).toEqual([])
    expect(cellsInTown(t, at(X + 2, Y + 2), 0)).toEqual([])
  })
  it('離れた部品（島）もそれぞれマスになる', () => {
    const t = town({ type: 'MultiPolygon', coordinates: [[rect(X, Y, 2, 2)], [rect(X + 20, Y, 3, 3)]] })
    expect(cellsInTown(t, at(X + 10, Y), 2000)).toHaveLength(4 + 9)
  })
})
