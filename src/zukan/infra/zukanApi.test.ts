import { describe, expect, it, vi } from 'vitest'
import { cellKey, cellOf } from '../../fog/domain/grid.ts'

const TOKYO = { lat: 35.1, lng: 139.1 }
const clearedCell = cellOf(TOKYO) // 晴れている場所（hp:A の店の場所）

vi.mock('../../checkin/infra/checkinApi.ts', () => ({
  loadProgress: async () => ({
    cells: [clearedCell],
    checkedShopIds: new Set(['hp:A']),
    visitsByShop: new Map([['hp:A', { count: 2, firstDay: '2026-11-03', lastDay: '2026-11-08' }]]),
  }),
}))

import { loadZukan } from './zukanApi.ts'

const fakeClient = (rows: Record<string, unknown>[] | null, error: unknown = null) => ({
  from: () => ({
    select: () => ({
      order: () => ({
        range: (from: number, to: number) => Promise.resolve({ data: rows ? rows.slice(from, to + 1) : null, error }),
      }),
    }),
  }),
})

describe('loadZukan', () => {
  it('shops の行を図鑑の店に直し、自分の記録と晴れているかを付ける', async () => {
    const shops = await loadZukan(fakeClient([
      { shop_id: 'hp:A', name: '麺屋A', lat: TOKYO.lat, lng: TOKYO.lng, genre_code: 'G013', genre_name: 'ラーメン', catch: 'こだわり', photo_url: 'https://x/l.jpg' },
      { shop_id: 'hp:B', name: 'カフェB', lat: 35.2, lng: 139.2, genre_code: null, genre_name: null, catch: null, photo_url: 'http://bad' },
    ]))
    expect(shops).toHaveLength(2)
    expect(shops[0]).toMatchObject({ id: 'hp:A', kind: 'ramen', photoUrl: 'https://x/l.jpg', visits: { count: 2, lastDay: '2026-11-08' }, cleared: true })
    expect(shops[1]).toMatchObject({ id: 'hp:B', photoUrl: null, visits: null, cleared: false })
  })
  it('読めなければ throw（図鑑は「読み込めませんでした」を出す）', async () => {
    await expect(loadZukan(fakeClient(null, { message: 'x' }))).rejects.toThrow()
  })
  it('名前や場所が無い行は捨てる', async () => {
    const shops = await loadZukan(fakeClient([{ shop_id: 'hp:Z', name: '', lat: 1, lng: 1 }]))
    expect(shops).toEqual([])
  })
  it('地図のお店（osm:）は地図と同じ決め方のジャンル。ホットペッパーの店と同じ店なら 1 枚にまとめ、回数を合わせる', async () => {
    const shops = await loadZukan(fakeClient([
      { shop_id: 'osm:9', name: 'たこ焼き まる', lat: 35.2, lng: 139.2, genre_name: 'fast_food' },
      { shop_id: 'hp:A', name: '麺屋A', lat: TOKYO.lat, lng: TOKYO.lng, genre_code: 'G013', genre_name: 'ラーメン' },
      { shop_id: 'osm:7', name: '麺屋A', lat: TOKYO.lat, lng: TOKYO.lng + 0.0001, genre_name: 'restaurant' },
    ]))
    expect(shops.find((s) => s.id === 'osm:9')).toMatchObject({ kind: 'takoyaki' })
    expect(shops.find((s) => s.id === 'hp:A')).toMatchObject({ mapId: 'osm:7' })
  })
  it('今の地図のお店を足し、地図の晴れたマスも晴れとして数える', async () => {
    const extra = { id: 'osm:5', name: 'たこ焼き ころ', lat: 35.3, lng: 139.3, kind: 'takoyaki' as const, details: null, mapId: null }
    const shops = await loadZukan(fakeClient([]), { mapShops: [extra], cleared: new Set([cellKey(cellOf(extra))]) })
    expect(shops).toEqual([expect.objectContaining({ id: 'osm:5', name: 'たこ焼き ころ', kind: 'takoyaki', cleared: true, visits: null })])
  })
})

