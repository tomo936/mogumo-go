import { describe, expect, it, vi } from 'vitest'
import { loadProgress, postCheckin } from './checkinApi.ts'

const base = { endpoint: 'https://x.supabase.co/functions/v1/checkin', anonKey: 'anon', getToken: () => Promise.resolve('tok') }
const input = { shopId: 'hp:J001', me: { lat: 35.68, lng: 139.76 }, farFromHome: true }
const res = (status: number, body: unknown = {}) => new Response(JSON.stringify(body), { status })

describe('postCheckin', () => {
  it('map_id は mapId があるときだけ body に入る', async () => {
    const ok = () => vi.fn().mockResolvedValue(res(200, { checkin_id: 'c1', coins_awarded: 30, new_cells: [] }))
    const f1 = ok()
    await postCheckin({ ...input, mapId: 'osm:42' }, { ...base, fetchFn: f1 })
    expect(JSON.parse(f1.mock.calls[0][1].body).map_id).toBe('osm:42')
    for (const mapId of [undefined, null]) {
      const f2 = ok()
      await postCheckin({ ...input, mapId }, { ...base, fetchFn: f2 })
      expect(JSON.parse(f2.mock.calls[0][1].body)).not.toHaveProperty('map_id')
    }
  })
  it('body は {shop_id,lat,lng,far_from_home} だけで、認証ヘッダー付き', async () => {
    const fetchFn = vi.fn().mockResolvedValue(res(200, { checkin_id: 'c1', coins_awarded: 30, new_cells: [[1, 2], [3, 4]] }))
    const r = await postCheckin(input, { ...base, fetchFn })
    const [url, init] = fetchFn.mock.calls[0]
    expect(url).toBe(base.endpoint)
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toEqual({ shop_id: 'hp:J001', lat: 35.68, lng: 139.76, far_from_home: true })
    expect(init.headers).toEqual({ 'Content-Type': 'application/json', apikey: 'anon', Authorization: 'Bearer tok' })
    expect(r).toEqual({ ok: true, checkinId: 'c1', coins: 30, newCells: [{ x: 1, y: 2 }, { x: 3, y: 4 }] })
  })
  it('coins 0 も受ける', async () => {
    const fetchFn = vi.fn().mockResolvedValue(res(200, { checkin_id: 'c2', coins_awarded: 0, new_cells: [] }))
    expect(await postCheckin(input, { ...base, fetchFn })).toEqual({ ok: true, checkinId: 'c2', coins: 0, newCells: [] })
  })
  it.each([
    [403, 'too_far'],
    [404, 'not_found'],
    [409, 'no_profile'],
    [400, 'network'],
    [401, 'network'],
    [500, 'network'],
    [502, 'network'],
  ])('%i は %s', async (status, reason) => {
    const fetchFn = vi.fn().mockResolvedValue(res(status as number))
    expect(await postCheckin(input, { ...base, fetchFn })).toEqual({ ok: false, reason })
    expect(fetchFn).toHaveBeenCalledTimes(1) // 再送しない
  })
  it('通信失敗・壊れた JSON は network', async () => {
    expect(await postCheckin(input, { ...base, fetchFn: vi.fn().mockRejectedValue(new Error('x')) })).toEqual({ ok: false, reason: 'network' })
    const bad = vi.fn().mockResolvedValue(new Response('<html>', { status: 200 }))
    expect(await postCheckin(input, { ...base, fetchFn: bad })).toEqual({ ok: false, reason: 'network' })
    const odd = vi.fn().mockResolvedValue(res(200, { checkin_id: 1 }))
    expect(await postCheckin(input, { ...base, fetchFn: odd })).toEqual({ ok: false, reason: 'network' })
  })
  it('トークンが無ければ fetch せず network', async () => {
    const fetchFn = vi.fn()
    expect(await postCheckin(input, { ...base, getToken: () => Promise.resolve(null), fetchFn })).toEqual({ ok: false, reason: 'network' })
    expect(fetchFn).not.toHaveBeenCalled()
  })
})

describe('loadProgress', () => {
  // テーブルごとに、頁（range）で切って返す偽クライアント
  const client = (tables: Record<string, { data: unknown[] | null; error: unknown }>) => ({
    from: (t: string) => ({
      select: () => {
        const q = {
          order: () => q,
          range: (from: number, to: number) => {
            const { data, error } = tables[t]
            return Promise.resolve({ data: data ? data.slice(from, to + 1) : null, error })
          },
        }
        return q
      },
    }),
  })
  it('行を cells と Set にする', async () => {
    const p = await loadProgress(
      client({
        fog_cells: { data: [{ cell_x: 1, cell_y: 2 }, { cell_x: -3, cell_y: 4 }], error: null },
        checkins: { data: [{ shop_id: 'hp:A' }, { shop_id: 'hp:A' }, { shop_id: 'osm:1' }], error: null },
      }),
    )
    expect(p.cells).toEqual([{ x: 1, y: 2 }, { x: -3, y: 4 }])
    expect(p.checkedShopIds).toEqual(new Set(['hp:A', 'osm:1']))
  })
  it('1000 行を超えても頁をたどって全部読む（両テーブル）', async () => {
    const cellRows = Array.from({ length: 1003 }, (_, i) => ({ cell_x: i, cell_y: -i }))
    const shopRows = Array.from({ length: 1003 }, (_, i) => ({ shop_id: `hp:${i}` }))
    const p = await loadProgress(
      client({ fog_cells: { data: cellRows, error: null }, checkins: { data: shopRows, error: null } }),
    )
    expect(p.cells).toHaveLength(1003)
    expect(p.cells[1002]).toEqual({ x: 1002, y: -1002 })
    expect(p.checkedShopIds.size).toBe(1003)
    expect(p.checkedShopIds.has('hp:1002')).toBe(true)
  })
  it('ちょうど 1000 行なら次の頁（空）まで読んで終わる', async () => {
    const cellRows = Array.from({ length: 1000 }, (_, i) => ({ cell_x: i, cell_y: 0 }))
    const p = await loadProgress(client({ fog_cells: { data: cellRows, error: null }, checkins: { data: [], error: null } }))
    expect(p.cells).toHaveLength(1000)
  })
  it('エラーなら throw', async () => {
    await expect(
      loadProgress(client({ fog_cells: { data: null, error: { message: 'x' } }, checkins: { data: [], error: null } })),
    ).rejects.toThrow()
  })
})
