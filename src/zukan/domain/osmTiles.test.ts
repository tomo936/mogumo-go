import { describe, expect, it } from 'vitest'
import { cellKey, cellOf } from '../../fog/domain/grid.ts'
import { dueTiles, tileOf, tilesOfClearedShops } from './osmTiles.ts'
import type { Shop } from '../../shops/domain/shop.ts'

const shop = (id: string, lat: number, lng: number): Shop => ({ id, name: id, lat, lng, kind: 'takoyaki', details: null, mapId: null })

describe('tileOf', () => {
  it('ズーム 14 のタイル（東京駅）', () => {
    expect(tileOf({ lat: 35.6812, lng: 139.7671 })).toEqual({ x: 14552, y: 6451 })
  })
})

describe('tilesOfClearedShops', () => {
  it('晴れたマスにある osm: の店のタイルだけ、重複なし', () => {
    const a = shop('osm:1', 35.6812, 139.7671)
    const b = shop('osm:2', 35.6813, 139.7672)
    const fog = shop('osm:3', 35.70, 139.70)
    const hp = shop('hp:1', 35.6812, 139.7671)
    const cleared = new Set([cellKey(cellOf(a)), cellKey(cellOf(b)), cellKey(cellOf(hp))])
    expect(tilesOfClearedShops([a, b, fog, hp], cleared)).toEqual([{ x: 14552, y: 6451 }])
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
