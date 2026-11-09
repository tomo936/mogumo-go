import { describe, expect, it, vi } from 'vitest'
import { parseHintSet, postDailyHints, readTodayHints } from './hintsApi.ts'
import type { HintsClient } from './hintsApi.ts'

const base = { endpoint: 'https://x.supabase.co/functions/v1/daily-hints', anonKey: 'anon', getToken: () => Promise.resolve('tok') }
const input = { regen: false, candidates: { hp: ['hp:A'], osm: [{ id: 'osm:1', lat: 35, lng: 139 }] } }
const res = (status: number, body: unknown = {}) => new Response(JSON.stringify(body), { status })
const hintJson = (o: Record<string, unknown> = {}) => ({
  hint_id: 'h1', slot: 1, shop_id: 'hp:A', hint_genre: '中華', hint_catch: '自家製麺', hint_budget: '1,000円台',
  is_mystery: false, completed: false, shop: { name: '一郎', lat: 35.1, lng: 139.1 }, ...o,
})
const setJson = (hints: unknown[] = [hintJson()]) => ({ hint_date: '2026-11-07', generation: 1, regen_left: 1, hints })

describe('parseHintSet', () => {
  it('正しい形は HintSet に、slot 順に直す', () => {
    const s = parseHintSet(setJson([hintJson({ hint_id: 'b', slot: 2 }), hintJson({ hint_id: 'a', slot: 1 })]))
    expect(s?.hints.map((h) => h.id)).toEqual(['a', 'b'])
    expect(s).toMatchObject({ day: '2026-11-07', generation: 1, regenLeft: 1 })
    expect(s?.hints[0]).toMatchObject({ shopId: 'hp:A', genre: '中華', catch: '自家製麺', budget: '1,000円台', shop: { name: '一郎' } })
  })
  it('hints が空は空の組として通す', () => {
    expect(parseHintSet({ hint_date: '2026-11-07', generation: 0, regen_left: 0, hints: [] })?.hints).toEqual([])
  })
  it('1件でも形が違えば null', () => {
    expect(parseHintSet(setJson([hintJson(), hintJson({ slot: undefined })]))).toBeNull()
    expect(parseHintSet({ ...setJson(), regen_left: 2 })).toBeNull()
    expect(parseHintSet(null)).toBeNull()
  })
})

describe('postDailyHints', () => {
  it('200 の正しい形 → ok。本文は regen・hp・osm だけ', async () => {
    const fetchFn = vi.fn().mockResolvedValue(res(200, setJson()))
    const r = await postDailyHints(input, { ...base, fetchFn })
    expect(r.ok).toBe(true)
    const [url, init] = fetchFn.mock.calls[0]
    expect(url).toBe(base.endpoint)
    expect(Object.keys(JSON.parse(init.body)).sort()).toEqual(['hp', 'osm', 'regen'])
    expect(init.headers).toEqual({ 'Content-Type': 'application/json', apikey: 'anon', Authorization: 'Bearer tok' })
  })
  it('slot 無しの1件 → network', async () => {
    const fetchFn = vi.fn().mockResolvedValue(res(200, setJson([hintJson({ slot: undefined })])))
    expect(await postDailyHints(input, { ...base, fetchFn })).toEqual({ ok: false, reason: 'network' })
  })
  it.each([
    ['profile_missing', 'no_profile'], ['regen_used', 'regen_used'], ['regen_done', 'regen_done'],
    ['no_hints', 'no_hints'], ['not_far', 'not_far'], ['???', 'network'],
  ])('409 %s は %s', async (error, reason) => {
    const fetchFn = vi.fn().mockResolvedValue(res(409, { error }))
    expect(await postDailyHints(input, { ...base, fetchFn })).toEqual({ ok: false, reason })
    expect(fetchFn).toHaveBeenCalledTimes(1) // 再送しない
  })
  it('500・fetch の例外・トークン無しは network', async () => {
    expect(await postDailyHints(input, { ...base, fetchFn: vi.fn().mockResolvedValue(res(500)) })).toEqual({ ok: false, reason: 'network' })
    expect(await postDailyHints(input, { ...base, fetchFn: vi.fn().mockRejectedValue(new Error('x')) })).toEqual({ ok: false, reason: 'network' })
    const f = vi.fn()
    expect(await postDailyHints(input, { ...base, getToken: () => Promise.resolve(null), fetchFn: f })).toEqual({ ok: false, reason: 'network' })
    expect(f).not.toHaveBeenCalled()
  })
})

describe('readTodayHints', () => {
  const client = (data: unknown, error: unknown = null): HintsClient => ({
    from: () => ({ select: () => ({ eq: () => Promise.resolve({ data, error }) }) }),
  })
  const row = (o: Record<string, unknown>) => ({
    hint_id: 'x', slot: 1, shop_id: 'hp:A', generation: 1, hint_genre: null, hint_catch: null, hint_budget: null,
    is_mystery: false, completed_checkin_id: null, shops: { name: '店', lat: 35, lng: 139 }, ...o,
  })
  it('generation 1 と 2 の行 → 2 の組だけ・regenLeft 0・slot 順', async () => {
    const r = await readTodayHints('2026-11-07', client([
      row({ hint_id: 'old', generation: 1 }), row({ hint_id: 'n2', generation: 2, slot: 2 }), row({ hint_id: 'n1', generation: 2, slot: 1, completed_checkin_id: 'c' }),
    ]))
    expect(r.ok && r.set?.hints.map((h) => h.id)).toEqual(['n1', 'n2'])
    expect(r.ok && r.set).toMatchObject({ generation: 2, regenLeft: 0, day: '2026-11-07' })
    expect(r.ok && r.set?.hints[0].completed).toBe(true)
  })
  it('generation 1 だけなら regenLeft 1', async () => {
    const r = await readTodayHints('2026-11-07', client([row({})]))
    expect(r.ok && r.set?.regenLeft).toBe(1)
  })
  it('行なし → set: null', async () => {
    expect(await readTodayHints('2026-11-07', client([]))).toEqual({ ok: true, set: null })
  })
  it('エラー（列が無いなど）→ ok:false', async () => {
    expect(await readTodayHints('2026-11-07', client(null, { message: 'column generation does not exist' }))).toEqual({ ok: false })
  })
})
