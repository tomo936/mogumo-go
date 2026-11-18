import { describe, expect, it, vi } from 'vitest'
import { loadClearedTowns, syncTowns, syncUntilSettled } from './townsApi.ts'
import type { TownsClient } from './townsApi.ts'
import type { TownSync } from '../domain/progress.ts'

const reply = {
  towns: [{ id: '13112-経堂', name: '経堂', city: '世田谷区', visited: 3, total: 12, cleared_at: null, completed_at: null, counting: false, last_at: '2026-11-08T03:00:00Z' }],
  newly: [],
  more: false,
}
const base = { endpoint: 'https://example.test/functions/v1/towns', anonKey: 'anon', getToken: async () => 'token' }
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

describe('syncTowns', () => {
  it('200 の返事を読む。位置は送らない', async () => {
    const fetchFn = vi.fn(async () => json(reply))
    const s = await syncTowns({ ...base, fetchFn: fetchFn as unknown as typeof fetch })
    expect(s?.towns[0]).toMatchObject({ id: '13112-経堂', visited: 3, total: 12 })
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(base.endpoint)
    expect(init.method).toBe('POST')
    expect(init.body).toBe('{}')
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer token')
    expect((init.headers as Record<string, string>).apikey).toBe('anon')
  })
  it('500・通信エラー・ログインなし・変な返事は null', async () => {
    expect(await syncTowns({ ...base, fetchFn: (async () => json({ error: 'internal_error' }, 500)) as unknown as typeof fetch })).toBeNull()
    expect(await syncTowns({ ...base, fetchFn: (async () => { throw new Error('offline') }) as unknown as typeof fetch })).toBeNull()
    expect(await syncTowns({ ...base, fetchFn: (async () => json({ nope: 1 })) as unknown as typeof fetch })).toBeNull()
    const fetchFn = vi.fn(async () => json(reply))
    expect(await syncTowns({ ...base, getToken: async () => null, fetchFn: fetchFn as unknown as typeof fetch })).toBeNull()
    expect(fetchFn).not.toHaveBeenCalled()
  })
})

describe('syncUntilSettled', () => {
  const s = (more: boolean): TownSync => ({ towns: [], newly: [], more })
  const wait = async () => {}
  it('more のあいだ呼び直す（true, true, false → 3回）', async () => {
    const answers = [s(true), s(true), s(false)]
    const sync = vi.fn(async () => answers.shift() ?? null)
    const waited: number[] = []
    const onUpdate = vi.fn()
    await syncUntilSettled(onUpdate, { sync, wait: async (ms) => { waited.push(ms) } })
    expect(sync).toHaveBeenCalledTimes(3)
    expect(onUpdate).toHaveBeenCalledTimes(3)
    expect(waited).toEqual([3000, 3000])
  })
  it('上限で止まる', async () => {
    const sync = vi.fn(async () => s(true))
    const onUpdate = vi.fn()
    await syncUntilSettled(onUpdate, { sync, wait, max: 2 })
    expect(sync).toHaveBeenCalledTimes(2)
    expect(onUpdate).toHaveBeenCalledTimes(2)
  })
  it('失敗（null）で止まる', async () => {
    const answers: (TownSync | null)[] = [s(true), null, s(false)]
    const sync = vi.fn(async () => answers.shift() ?? null)
    const onUpdate = vi.fn()
    await syncUntilSettled(onUpdate, { sync, wait })
    expect(sync).toHaveBeenCalledTimes(2)
    expect(onUpdate).toHaveBeenCalledTimes(1)
  })
  it('alive が false なら呼ばない・知らせない', async () => {
    let alive = true
    const sync = vi.fn(async () => { alive = false; return s(true) })
    const onUpdate = vi.fn()
    await syncUntilSettled(onUpdate, { sync, wait, alive: () => alive })
    expect(sync).toHaveBeenCalledTimes(1)
    expect(onUpdate).not.toHaveBeenCalled()
    const never = vi.fn(async () => s(false))
    await syncUntilSettled(onUpdate, { sync: never, wait, alive: () => false })
    expect(never).not.toHaveBeenCalled()
  })
})

describe('loadClearedTowns', () => {
  const boundary = { type: 'Polygon', coordinates: [[[139.63, 35.64], [139.64, 35.64], [139.64, 35.65], [139.63, 35.64]]] }
  function client(conquests: unknown[], towns: unknown[], fail?: 'conquests' | 'towns'): { c: TownsClient; asked: string[][] } {
    const asked: string[][] = []
    const c: TownsClient = {
      from: (table) => ({
        select: () => {
          const q = {
            order: () => q,
            range: async () => (fail === 'conquests' ? { data: null, error: { message: 'x' } } : { data: table === 'town_conquests' ? conquests : [], error: null }),
            in: async (_col: string, values: string[]) => {
              asked.push(values)
              return fail === 'towns' ? { data: null, error: { message: 'x' } } : { data: towns, error: null }
            },
          }
          return q
        },
      }),
    }
    return { c, asked }
  }
  it('クリアした町を、形と四角つきで返す（古い順）', async () => {
    const { c, asked } = client(
      [
        { town_id: '13112-宮坂', conquered_at: '2026-11-09T03:00:05Z' },
        { town_id: '13112-経堂', conquered_at: '2026-11-08T03:00:05Z' },
        { town_id: '13112-消えた', conquered_at: '2026-11-07T03:00:05Z' },
      ],
      [
        { town_id: '13112-宮坂', name: '宮坂', city_name: '世田谷区', area_m2: 500000, boundary },
        { town_id: '13112-経堂', name: '経堂', city_name: null, area_m2: null, boundary },
      ],
    )
    const towns = await loadClearedTowns(c)
    expect(towns.map((t) => t.name)).toEqual(['経堂', '宮坂'])
    expect(towns[1]).toMatchObject({ id: '13112-宮坂', city: '世田谷区', areaM2: 500000, at: Date.parse('2026-11-09T03:00:05Z'), bbox: [139.63, 35.64, 139.64, 35.65] })
    expect(towns[0]).toMatchObject({ city: null, areaM2: 0 })
    expect(asked).toEqual([['13112-宮坂', '13112-経堂', '13112-消えた']])
  })
  it('形が読めない町は捨てる。クリアが無ければ towns は読まない', async () => {
    const bad = client([{ town_id: 'a', conquered_at: '2026-11-09T03:00:05Z' }], [{ town_id: 'a', name: 'あ', boundary: { type: 'Point' } }])
    expect(await loadClearedTowns(bad.c)).toEqual([])
    const none = client([], [])
    expect(await loadClearedTowns(none.c)).toEqual([])
    expect(none.asked).toEqual([])
  })
  it('読めなければ throw', async () => {
    await expect(loadClearedTowns(client([], [], 'conquests').c)).rejects.toThrow()
    await expect(loadClearedTowns(client([{ town_id: 'a', conquered_at: '2026-11-09T03:00:05Z' }], [], 'towns').c)).rejects.toThrow()
  })
  it('100 件ずつ聞く', async () => {
    const many = Array.from({ length: 250 }, (_, i) => ({ town_id: `t${i}`, conquered_at: '2026-11-09T03:00:05Z' }))
    const { c, asked } = client(many, [])
    await loadClearedTowns(c)
    expect(asked.map((a) => a.length)).toEqual([100, 100, 50])
  })
})
