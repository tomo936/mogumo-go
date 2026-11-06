import { describe, expect, it, vi } from 'vitest'
import { distanceMeters } from '../../map/domain/geo.ts'
import fixture from './__fixtures__/overpass.json'
import { fetchShops, overpassQuery, parseOverpass, roundCenter, shopSourceEnabled } from './overpass.ts'

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
  it('200 でも JSON が読めなければやり直す', async () => {
    const fetchFn = vi.fn().mockResolvedValueOnce(new Response('<html>busy</html>', { status: 200 })).mockResolvedValueOnce(res(200))
    expect(await fetchShops(center, { fetchFn, waitMs: 0 })).toHaveLength(4)
    expect(fetchFn).toHaveBeenCalledTimes(2)
  })
  it('AbortError でもやり直す', async () => {
    const fetchFn = vi.fn().mockRejectedValueOnce(new DOMException('aborted', 'AbortError')).mockResolvedValueOnce(res(200))
    expect(await fetchShops(center, { fetchFn, waitMs: 0 })).toHaveLength(4)
    expect(fetchFn).toHaveBeenCalledTimes(2)
  })
  it('応答が来ないと 25 秒で打ち切ってやり直す', async () => {
    vi.useFakeTimers()
    try {
      const hang = (_u: unknown, init?: RequestInit) =>
        new Promise<Response>((_r, reject) => init!.signal!.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))))
      const fetchFn = vi.fn().mockImplementationOnce(hang).mockResolvedValueOnce(res(200))
      const p = fetchShops(center, { fetchFn, waitMs: 0 })
      await vi.advanceTimersByTimeAsync(24999)
      expect(fetchFn).toHaveBeenCalledTimes(1)
      await vi.advanceTimersByTimeAsync(1)
      await vi.runAllTimersAsync() // やり直し前の待ち（waitMs: 0）
      expect(await p).toHaveLength(4)
      expect(fetchFn).toHaveBeenCalledTimes(2)
    } finally {
      vi.useRealTimers()
    }
  })
  it('送る中心は 250m のマスに丸める（同じマスの 50m 離れた2点は同じ中心）', async () => {
    const sent: string[] = []
    const fetchFn = vi.fn((_u: unknown, init?: RequestInit) => {
      sent.push(decodeURIComponent(String(init!.body)).match(/around:1000,([^)]*)\)/)![1])
      return Promise.resolve(res(200))
    })
    const cell = roundCenter(center, 250)
    const a = { lat: cell.lat + 25 / 111195, lng: cell.lng + 0.0001 }
    const b = { lat: cell.lat - 25 / 111195, lng: cell.lng + 0.0001 }
    expect(distanceMeters(a, b)).toBeCloseTo(50, 0)
    await fetchShops(a, { fetchFn, waitMs: 0 })
    await fetchShops(b, { fetchFn, waitMs: 0 })
    expect(sent[0]).toBe(sent[1])
    expect(sent[0]).not.toContain(String(a.lat))
    expect(sent[0]).toBe(`${cell.lat},${cell.lng}`)
  })
})

describe('roundCenter', () => {
  it('近くの格子点に寄せ、ずれは半マスの対角まで', () => {
    const c = roundCenter(center, 250)
    expect(distanceMeters(center, c)).toBeLessThan(180)
    expect(roundCenter(c, 250)).toEqual(c)
  })
})

describe('shopSourceEnabled', () => {
  it('開発中かdevドメインだけ', () => {
    expect(shopSourceEnabled(true, 'localhost')).toBe(true)
    expect(shopSourceEnabled(false, 'mogumo-go-dev.vercel.app')).toBe(true)
    expect(shopSourceEnabled(false, 'mogumo-go.vercel.app')).toBe(false)
  })
})
