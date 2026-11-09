import { describe, expect, it, vi } from 'vitest'
import { distanceMeters } from '../../map/domain/geo.ts'
import { fetchHotpepperShops, roundCenter, shopSourceEnabled } from './hotpepper.ts'

const center = { lat: 35.6812, lng: 139.7671 }
const base = { endpoint: 'https://x.supabase.co/functions/v1/shops-hotpepper', anonKey: 'anon', getToken: () => Promise.resolve('tok'), waitMs: 0 }
const rows = [
  {
    shop_id: 'hp:J001', name: '麺屋いろは', lat: 35.681, lng: 139.767, genre_code: 'G013', genre_name: 'ラーメン',
    catch: 'こだわり', budget_code: 'B002', budget_name: '~1000円', photo_url: null, open: '11:00～22:00',
  },
  {
    shop_id: 'hp:J002', name: 'カフェあお', lat: 35.682, lng: 139.768, genre_code: null, genre_name: null,
    catch: null, budget_code: null, budget_name: null, photo_url: null, open: null,
  },
]
const res = (status: number, body: unknown = rows) => new Response(JSON.stringify(body), { status })

describe('fetchHotpepperShops', () => {
  it('関数の URL へ JSON {lat,lng}（丸め済み）を認証ヘッダー付きで POST する', async () => {
    const fetchFn = vi.fn().mockResolvedValue(res(200))
    await fetchHotpepperShops(center, { ...base, fetchFn })
    const [url, init] = fetchFn.mock.calls[0]
    const c = roundCenter(center, 250)
    expect(url).toBe(base.endpoint)
    expect(url).toContain('shops-hotpepper')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toEqual({ lat: c.lat, lng: c.lng })
    expect(init.headers).toEqual({ 'Content-Type': 'application/json', apikey: 'anon', Authorization: 'Bearer tok' })
  })
  it('行を Shop に直す（kind と details）', async () => {
    const shops = await fetchHotpepperShops(center, { ...base, fetchFn: vi.fn().mockResolvedValue(res(200)) })
    expect(shops).toHaveLength(2)
    expect(shops[0]).toEqual({
      id: 'hp:J001', name: '麺屋いろは', lat: 35.681, lng: 139.767, kind: 'ramen',
      details: { genreCode: 'G013', genreName: 'ラーメン', catch: 'こだわり', budgetName: '~1000円', photoUrl: null, open: '11:00～22:00' }, mapId: null,
    })
    expect(shops[1].id).toBe('hp:J002')
  })
  it('写真の URL は https:// のものだけ通す', async () => {
    const body = [
      { ...rows[0], photo_url: 'https://imgfp.hotp.jp/x_l.jpg' },
      { ...rows[1], photo_url: 'http://x/l.jpg' },
      { ...rows[0], shop_id: 'hp:J003', photo_url: 123 },
    ]
    const shops = await fetchHotpepperShops(center, { ...base, fetchFn: vi.fn().mockResolvedValue(res(200, body)) })
    expect(shops.map((s) => s.details?.photoUrl)).toEqual(['https://imgfp.hotp.jp/x_l.jpg', null, null])
  })
  it('トークンが無ければ fetch せず shops_unavailable', async () => {
    const fetchFn = vi.fn()
    await expect(fetchHotpepperShops(center, { ...base, fetchFn, getToken: () => Promise.resolve(null) })).rejects.toThrow('shops_unavailable')
    expect(fetchFn).not.toHaveBeenCalled()
  })
  it('429 のあと 200 でやり直して取れる', async () => {
    const fetchFn = vi.fn().mockResolvedValueOnce(res(429, {})).mockResolvedValueOnce(res(200))
    expect(await fetchHotpepperShops(center, { ...base, fetchFn })).toHaveLength(2)
    expect(fetchFn).toHaveBeenCalledTimes(2)
  })
  it('5xx も2回とも失敗なら shops_unavailable', async () => {
    const fetchFn = vi.fn().mockImplementation(() => Promise.resolve(res(502, {})))
    await expect(fetchHotpepperShops(center, { ...base, fetchFn })).rejects.toThrow('shops_unavailable')
    expect(fetchFn).toHaveBeenCalledTimes(2)
  })
  it('400 はやり直さない', async () => {
    const fetchFn = vi.fn().mockImplementation(() => Promise.resolve(res(400, {})))
    await expect(fetchHotpepperShops(center, { ...base, fetchFn })).rejects.toThrow('shops_unavailable')
    expect(fetchFn).toHaveBeenCalledTimes(1)
  })
  it('ネットワーク失敗もやり直す', async () => {
    const fetchFn = vi.fn().mockRejectedValueOnce(new TypeError('x')).mockResolvedValueOnce(res(200))
    expect(await fetchHotpepperShops(center, { ...base, fetchFn })).toHaveLength(2)
  })
  it('200 でも JSON が読めなければやり直す', async () => {
    const fetchFn = vi.fn().mockResolvedValueOnce(new Response('<html>busy</html>', { status: 200 })).mockResolvedValueOnce(res(200))
    expect(await fetchHotpepperShops(center, { ...base, fetchFn })).toHaveLength(2)
    expect(fetchFn).toHaveBeenCalledTimes(2)
  })
  it('送る中心は 250m のマスに丸める', async () => {
    const sent: string[] = []
    const fetchFn = vi.fn((_u: unknown, init?: RequestInit) => {
      const b = JSON.parse(String(init!.body))
      sent.push(`${b.lat},${b.lng}`)
      return Promise.resolve(res(200))
    })
    const cell = roundCenter(center, 250)
    const a = { lat: cell.lat + 25 / 111195, lng: cell.lng + 0.0001 }
    const b = { lat: cell.lat - 25 / 111195, lng: cell.lng + 0.0001 }
    await fetchHotpepperShops(a, { ...base, fetchFn })
    await fetchHotpepperShops(b, { ...base, fetchFn })
    expect(sent[0]).toBe(sent[1])
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
