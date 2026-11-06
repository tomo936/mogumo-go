import { describe, expect, it, vi } from 'vitest'
import fixture from './__fixtures__/overpass.json'
import { fetchShops, overpassQuery, parseOverpass, shopSourceEnabled } from './overpass.ts'

const center = { lat: 35.6812, lng: 139.7671 }
const res = (status: number, body: unknown = fixture) =>
  new Response(JSON.stringify(body), { status })

describe('overpassQuery', () => {
  it('範囲と条件が入る', () => {
    const q = overpassQuery(center, 1000)
    expect(q).toContain('around:1000,35.6812,139.7671')
    expect(q).toContain('amenity~"^(restaurant|cafe|fast_food|bar|pub|ice_cream)$"')
    expect(q).toContain('shop~"^(bakery|confectionery|pastry)$"')
    expect(q).toContain('["name"]')
    expect(q).toContain('out center')
  })
})

describe('parseOverpass', () => {
  it('名前なしを捨てて4件、way は center、種類は kindOf', () => {
    const shops = parseOverpass(fixture)
    expect(shops).toHaveLength(4)
    expect(shops[0]).toEqual({ id: 'osm:node/1001', name: '麺屋いろは', lat: 35.681, lng: 139.767, kind: 'ramen' })
    expect(shops[1].kind).toBe('cafe')
    expect(shops[2].kind).toBe('bakery')
    expect(shops[3]).toMatchObject({ id: 'osm:way/2001', lat: 35.684, lng: 139.77, kind: 'western' })
  })
  it('壊れた形は空配列', () => {
    expect(parseOverpass(null)).toEqual([])
    expect(parseOverpass({ elements: 'x' })).toEqual([])
    expect(parseOverpass({ elements: [null, 1, { type: 'node', id: 1, tags: { name: 'a' } }] })).toEqual([])
  })
})

describe('fetchShops', () => {
  it('429 のあと 200 でやり直して取れる', async () => {
    const fetchFn = vi.fn().mockResolvedValueOnce(res(429, {})).mockResolvedValueOnce(res(200))
    const shops = await fetchShops(center, { fetchFn, waitMs: 0 })
    expect(shops).toHaveLength(4)
    expect(fetchFn).toHaveBeenCalledTimes(2)
  })
  it('2回とも 429 なら shops_unavailable', async () => {
    const fetchFn = vi.fn().mockImplementation(() => Promise.resolve(res(429, {})))
    await expect(fetchShops(center, { fetchFn, waitMs: 0 })).rejects.toThrow('shops_unavailable')
    expect(fetchFn).toHaveBeenCalledTimes(2)
  })
  it('400 はやり直さない', async () => {
    const fetchFn = vi.fn().mockImplementation(() => Promise.resolve(res(400, {})))
    await expect(fetchShops(center, { fetchFn, waitMs: 0 })).rejects.toThrow('shops_unavailable')
    expect(fetchFn).toHaveBeenCalledTimes(1)
  })
  it('ネットワーク失敗もやり直す', async () => {
    const fetchFn = vi.fn().mockRejectedValueOnce(new TypeError('x')).mockResolvedValueOnce(res(200))
    expect(await fetchShops(center, { fetchFn, waitMs: 0 })).toHaveLength(4)
  })
})

describe('shopSourceEnabled', () => {
  it('開発中かdevドメインだけ', () => {
    expect(shopSourceEnabled(true, 'localhost')).toBe(true)
    expect(shopSourceEnabled(false, 'mogumo-go-dev.vercel.app')).toBe(true)
    expect(shopSourceEnabled(false, 'mogumo-go.vercel.app')).toBe(false)
  })
})
