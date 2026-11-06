import { describe, expect, it } from 'vitest'
import type { FeatureSource } from './mapFeatures.ts'
import { extractMapShops } from './mapShops.ts'

const center = { lat: 35, lng: 139 }
// 北へ m メートル（緯度 1 度 ≒ 111.2km）
const north = (m: number) => ({ lat: 35 + m / 111200, lng: 139 })

type F = { geometry: { type: 'Point'; coordinates: number[] }; properties: Record<string, unknown>; id?: number | string }
const poi = (id: number | undefined, subclass: string, name: string | undefined, m: number): F => {
  const at = north(m)
  return { id, geometry: { type: 'Point', coordinates: [at.lng, at.lat] }, properties: { subclass, name } }
}
const source = (fs: F[]): FeatureSource => ({ querySourceFeatures: () => fs as never })

describe('extractMapShops', () => {
  it('returns a restaurant 100 m away with osm id and kind', () => {
    const r = extractMapShops(source([poi(1, 'restaurant', 'ラーメン太郎', 100)]), center, 1000)
    expect(r).toHaveLength(1)
    expect(r[0].id).toBe('osm:1')
    expect(r[0].name).toBe('ラーメン太郎')
    expect(r[0].details).toBeNull()
    expect(typeof r[0].kind).toBe('string')
  })
  it('ignores non-food subclass', () => {
    expect(extractMapShops(source([poi(1, 'parking', 'P', 100)]), center, 1000)).toEqual([])
  })
  it('ignores nameless POIs', () => {
    expect(extractMapShops(source([poi(1, 'cafe', undefined, 100), poi(2, 'cafe', '', 100)]), center, 1000)).toEqual([])
  })
  it('dedupes by id', () => {
    const r = extractMapShops(source([poi(1, 'cafe', 'A', 100), poi(1, 'cafe', 'A', 100)]), center, 1000)
    expect(r).toHaveLength(1)
  })
  it('excludes shops beyond the radius', () => {
    expect(extractMapShops(source([poi(1, 'cafe', 'A', 1200)]), center, 1000)).toEqual([])
  })
  it('skips features without id', () => {
    expect(extractMapShops(source([poi(undefined, 'cafe', 'A', 100)]), center, 1000)).toEqual([])
  })
})
