import { describe, expect, it } from 'vitest'
import { areaKm2At, areaTimeline } from './area.ts'
import { bboxOf } from './shape.ts'
import type { ClearedTown, Geometry } from './shape.ts'
import { CELL_DEG } from '../../fog/domain/grid.ts'

const X = 223000
const Y = 158500
const CELL_KM2 = 0.000625
function townAt(id: string, x: number, y: number, w: number, areaM2: number, at: number): ClearedTown {
  const a = x * CELL_DEG.lng
  const b = y * CELL_DEG.lat
  const c = (x + w) * CELL_DEG.lng
  const d = (y + w) * CELL_DEG.lat
  const geom: Geometry = { type: 'Polygon', coordinates: [[[a, b], [c, b], [c, d], [a, d], [a, b]]] }
  return { id, name: id, city: null, areaM2, at, geom, bbox: bboxOf(geom) }
}

describe('areaTimeline', () => {
  it('町が無ければ、マスの時刻を並べるだけ', () => {
    const tl = areaTimeline([{ x: 1, y: 1, at: 30 }, { x: 2, y: 1, at: 10 }], [])
    expect(tl).toEqual({ cellTimes: [10, 30], townAreas: [] })
  })
  it('町の中のマス: クリアより前は残して町から引く・クリア以後は数えない', () => {
    const town = townAt('t', X, Y, 40, 1_000_000, 100)
    const cells = [
      { x: X + 1, y: Y + 1, at: 10 }, // 町の中・前
      { x: X + 2, y: Y + 1, at: 200 }, // 町の中・後 → 数えない
      { x: X + 500, y: Y, at: 50 }, // 町の外
    ]
    const tl = areaTimeline(cells, [town])
    expect(tl.cellTimes).toEqual([10, 50])
    expect(tl.townAreas).toHaveLength(1)
    expect(tl.townAreas[0].at).toBe(100)
    expect(tl.townAreas[0].km2).toBeCloseTo(1 - CELL_KM2, 9)
    expect(areaKm2At(tl, 60)).toBeCloseTo(2 * CELL_KM2, 9)
    expect(areaKm2At(tl, 100)).toBeCloseTo(1 + CELL_KM2, 9)
    expect(areaKm2At(tl, 9)).toBe(0)
  })
  it('クリアと同じ時刻のマス（チェックインの波）は町に入っている', () => {
    const town = townAt('t', X, Y, 40, 1_000_000, 100)
    const tl = areaTimeline([{ x: X + 1, y: Y + 1, at: 100 }], [town])
    expect(tl.cellTimes).toEqual([])
    expect(areaKm2At(tl, 100)).toBeCloseTo(1, 9)
  })
  it('町の広さは 0 より小さくならない', () => {
    const town = townAt('t', X, Y, 4, 1000, 100) // 16 マス = 10,000m² 入るのに、面積は 1,000m²
    const cells = [0, 1, 2, 3].map((i) => ({ x: X + i, y: Y, at: 10 }))
    const tl = areaTimeline(cells, [town])
    expect(tl.townAreas[0].km2).toBe(0)
    expect(areaKm2At(tl, 1000)).toBeCloseTo(4 * CELL_KM2, 9)
  })
  it('町が2つあれば、時刻の順に足される', () => {
    const a = townAt('a', X, Y, 4, 500_000, 300)
    const b = townAt('b', X + 100, Y, 4, 250_000, 200)
    const tl = areaTimeline([], [a, b])
    expect(tl.townAreas.map((t) => t.at)).toEqual([200, 300])
    expect(areaKm2At(tl, 250)).toBeCloseTo(0.25, 9)
    expect(areaKm2At(tl, 300)).toBeCloseTo(0.75, 9)
  })
})
