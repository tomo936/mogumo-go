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

// 絞り込み（or・in）は記録だけして、行はそのまま返す
const filters: string[] = []
const fakeClient = (rows: Record<string, unknown>[] | null, error: unknown = null) => {
  const q = {
    or: (f: string) => { filters.push(`or:${f}`); return q },
    in: (c: string, ids: string[]) => { filters.push(`in:${c}:${ids.join(',')}`); return q },
    order: () => q,
    range: (from: number, to: number) => Promise.resolve({ data: rows ? rows.slice(from, to + 1) : null, error }),
  }
  return { from: () => ({ select: () => q }) }
}

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
  it('読むのは晴れたマスのまわりの四角と、行ったお店の id だけ（表を全部は読まない）', async () => {
    filters.length = 0
    await loadZukan(fakeClient([]))
    expect(filters.some((f) => f.startsWith('or:and(lat.gte.') && f.includes('lng.gte.'))).toBe(true)
    expect(filters).toContain('in:shop_id:hp:A')
    expect(filters.every((f) => f.startsWith('or:') || f.startsWith('in:'))).toBe(true)
  })
})

// 本当に絞り込む偽のサーバー（or の四角と in の id を当てはめる）
const filteringClient = (rows: Record<string, unknown>[]) => {
  const make = (keep: (r: Record<string, unknown>) => boolean) => {
    const q = {
      or: (f: string) => {
        const boxes = [...f.matchAll(/and\(lat\.gte\.([-\d.]+),lat\.lt\.([-\d.]+),lng\.gte\.([-\d.]+),lng\.lt\.([-\d.]+)\)/g)].map((m) => m.slice(1).map(Number))
        return make((r) => keep(r) && boxes.some(([s, n, w, e]) => (r.lat as number) >= s && (r.lat as number) < n && (r.lng as number) >= w && (r.lng as number) < e))
      },
      in: (_c: string, ids: string[]) => make((r) => keep(r) && ids.includes(r.shop_id as string)),
      order: () => q,
      range: (from: number, to: number) => Promise.resolve({ data: rows.filter(keep).slice(from, to + 1), error: null }),
    }
    return q
  }
  return { from: () => ({ select: () => make(() => true) }) }
}

describe('読む範囲を絞っても、晴れた場所のお店は 1 軒も落とさない', () => {
  it('四角の境目のまわりにばらまいたお店で、全部読んだときと同じになる', async () => {
    const rows: Record<string, unknown>[] = []
    let seed = 7
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
    for (let i = 0; i < 300; i++) {
      // 1 度四方のあちこちの、四角の境目（0.02 度ごと）の ±0.0001 度（約 10m）に置く。晴れたマスどうしは離れているので、境目で落とすと気づける
      const lat = 35 + Math.floor(rnd() * 50) * 0.02 + (rnd() - 0.5) * 0.0002
      const lng = 139 + Math.floor(rnd() * 50) * 0.02 + (rnd() - 0.5) * 0.0002
      rows.push({ shop_id: `osm:${i}`, name: `店${i}`, lat, lng, genre_name: 'restaurant' })
    }
    const cleared = new Set(rows.filter((_, i) => i % 2 === 0).map((r) => cellKey(cellOf({ lat: r.lat as number, lng: r.lng as number }))))
    const want = rows.filter((r) => cleared.has(cellKey(cellOf({ lat: r.lat as number, lng: r.lng as number })))).map((r) => r.shop_id).sort()
    const got = (await loadZukan(filteringClient(rows), { cleared })).filter((s) => s.cleared).map((s) => s.id).sort()
    expect(got).toEqual(want)
  })
})
