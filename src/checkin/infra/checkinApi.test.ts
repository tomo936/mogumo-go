import { describe, expect, it, vi } from 'vitest'
import { loadProgress, postCheckin } from './checkinApi.ts'

const base = { endpoint: 'https://x.supabase.co/functions/v1/checkin', anonKey: 'anon', getToken: () => Promise.resolve('tok') }
const input = { shopId: 'hp:J001', me: { lat: 35.68, lng: 139.76 }, farFromHome: true }
const res = (status: number, body: unknown = {}) => new Response(JSON.stringify(body), { status })

describe('postCheckin', () => {
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
  const client = (tables: Record<string, { data: unknown; error: unknown }>) => ({
    from: (t: string) => ({ select: () => Promise.resolve(tables[t]) }),
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
  it('エラーなら throw', async () => {
    await expect(
      loadProgress(client({ fog_cells: { data: null, error: { message: 'x' } }, checkins: { data: [], error: null } })),
    ).rejects.toThrow()
  })
})
