import { describe, expect, it } from 'vitest'
import { cellKey, cellOf } from '../../fog/domain/grid.ts'
import { dueTiles, tileOf, tilesOfCleared } from './osmTiles.ts'


describe('tileOf', () => {
  it('ズーム 14 のタイル（東京駅）', () => {
    expect(tileOf({ lat: 35.6812, lng: 139.7671 })).toEqual({ x: 14552, y: 6451 })
  })
})

describe('tilesOfCleared', () => {
  it('晴れたマスが載っているタイル（重複なし）。地図に読み込んでいなくても選べる', () => {
    const a = cellKey(cellOf({ lat: 35.6812, lng: 139.7671 }))
    const b = cellKey(cellOf({ lat: 35.6813, lng: 139.7672 }))
    expect(tilesOfCleared(new Set([a, b]))).toEqual([{ x: 14552, y: 6451 }])
  })
  it('タイルの境目にまたがるマスは両側のタイル', () => {
    // ズーム 14 のタイルの西端（x=14552 の端の経度）をまたぐマス
    const west = (14552 / 2 ** 14) * 360 - 180
    const k = cellKey(cellOf({ lat: 35.6812, lng: west }))
    const xs = tilesOfCleared(new Set([k])).map((t) => t.x).sort()
    expect(xs).toEqual([14551, 14552])
  })
})

describe('dueTiles', () => {
  const t = (x: number) => ({ x, y: 1 })
  it('7 日たっていないタイルは送らない。9 枚まで', () => {
    const sent = { '1/1': '2026-11-10', '2/1': '2026-11-05' }
    expect(dueTiles([t(1), t(2), t(3)], sent, '2026-11-12')).toEqual([t(2), t(3)])
    expect(dueTiles(Array.from({ length: 12 }, (_, i) => t(i + 10)), {}, '2026-11-12')).toHaveLength(9)
  })
})
