import { describe, expect, it } from 'vitest'
import { cellKey, cellOf } from '../../fog/domain/grid.ts'
import { AREA_DEG, areaBoxes, boxFilter, nearbyTwins } from './area.ts'
import type { Shop } from '../../shops/domain/shop.ts'

const s = (id: string, name: string, lat: number, lng: number): Shop => ({ id, name, lat, lng, kind: 'ramen', details: null, mapId: null })

describe('areaBoxes', () => {
  it('晴れたマスを 0.02 度の四角にまとめる（同じ四角は 1 つ）', () => {
    const a = cellKey(cellOf({ lat: 35.6812, lng: 139.7671 }))
    const b = cellKey(cellOf({ lat: 35.6813, lng: 139.7672 }))
    const far = cellKey(cellOf({ lat: 34.70, lng: 135.50 }))
    const boxes = areaBoxes([a, b, far])
    expect(boxes).toHaveLength(2)
    for (const box of boxes) {
      expect(box.north - box.south).toBeCloseTo(AREA_DEG)
      expect(box.east - box.west).toBeCloseTo(AREA_DEG)
    }
    expect(boxes.some((x) => x.south <= 35.6812 && 35.6812 < x.north && x.west <= 139.7671 && 139.7671 < x.east)).toBe(true)
  })
  it('形の違うキーは捨てる', () => {
    expect(areaBoxes(['x', '1:'])).toEqual([])
  })
})

describe('boxFilter', () => {
  it('PostgREST の or の中身', () => {
    expect(boxFilter([{ south: 35.68, north: 35.7, west: 139.76, east: 139.78 }])).toBe('and(lat.gte.35.68,lat.lt.35.7,lng.gte.139.76,lng.lt.139.78)')
  })
})

describe('nearbyTwins', () => {
  it('近くの同じ名前の店だけを組にする（遠くの同じ名前は組にしない）', () => {
    const osm = [s('osm:1', '麺屋A', 35.6812, 139.7671), s('osm:2', '麺屋A', 34.70, 135.50)]
    const hp = [s('hp:1', '麺屋A', 35.6813, 139.7671)]
    expect(nearbyTwins(osm, hp)).toEqual(new Map([['hp:1', 'osm:1']]))
  })
  it('四角の境目をまたいでも組にする', () => {
    const osm = [s('osm:1', '麺屋A', 35.6599999, 139.7671)]
    const hp = [s('hp:1', '麺屋A', 35.6600001, 139.7671)]
    expect(nearbyTwins(osm, hp).get('hp:1')).toBe('osm:1')
  })
})
