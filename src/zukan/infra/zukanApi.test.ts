import { describe, expect, it, vi } from 'vitest'

vi.mock('../../checkin/infra/checkinApi.ts', () => ({
  loadProgress: async () => ({
    cells: [],
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
  it('shops の行を図鑑の店に直し、自分の記録を付ける', async () => {
    const shops = await loadZukan(fakeClient([
      { shop_id: 'hp:A', name: '麺屋A', lat: 35.1, lng: 139.1, genre_code: 'G013', genre_name: 'ラーメン', catch: 'こだわり', photo_url: 'https://x/l.jpg' },
      { shop_id: 'hp:B', name: 'カフェB', lat: 35.2, lng: 139.2, genre_code: null, genre_name: null, catch: null, photo_url: 'http://bad' },
    ]))
    expect(shops).toHaveLength(2)
    expect(shops[0]).toMatchObject({ id: 'hp:A', kind: 'ramen', photoUrl: 'https://x/l.jpg', visits: { count: 2, lastDay: '2026-11-08' } })
    expect(shops[1]).toMatchObject({ id: 'hp:B', photoUrl: null, visits: null })
  })
  it('読めなければ throw（図鑑は「読み込めませんでした」を出す）', async () => {
    await expect(loadZukan(fakeClient(null, { message: 'x' }))).rejects.toThrow()
  })
  it('名前や場所が無い行は捨てる', async () => {
    const shops = await loadZukan(fakeClient([{ shop_id: 'hp:Z', name: '', lat: 1, lng: 1 }]))
    expect(shops).toEqual([])
  })
})
