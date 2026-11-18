import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import type { LatLng } from '../../map/domain/geo.ts'
import type { MapViewHandle } from '../../map/ui/MapView.tsx'
import type { Shop } from '../../shops/domain/shop.ts'
import type { DailyHint, HintSet } from '../domain/hint.ts'
import { loadRevealed } from '../infra/revealStore.ts'
import { NO_HINTS_NOTICE, useDailyHints } from './useDailyHints.ts'

const M = 1 / 111195
const DAY = '2026-11-07'
const NOON = new Date('2026-11-07T03:00:00Z') // 日本時間 12時
const at = (m: number): LatLng => ({ lat: 35 + m * M, lng: 139 })
const hint = (id: string, m: number, o: Partial<DailyHint> = {}): DailyHint => ({
  id, slot: 1, shopId: `hp:${id}`, genre: '中華', catch: null, budget: null, isMystery: false, completed: false,
  shop: { name: `店${id}`, ...at(m) }, ...o,
})
const mkSet = (hints: DailyHint[], o: Partial<HintSet> = {}): HintSet => ({ day: DAY, generation: 1, regenLeft: 1, hints, ...o })
const three = () => mkSet([hint('a', 300), hint('b', 600), hint('c', 900)])
const shopOf = (h: DailyHint): Shop => ({ id: h.shopId, name: h.shop.name, lat: h.shop.lat, lng: h.shop.lng, kind: 'ramen', details: null, mapId: null })

let handle: { whenShopsReady: ReturnType<typeof vi.fn>; hintInputs: ReturnType<typeof vi.fn>; setHints: ReturnType<typeof vi.fn>; bounceHint: ReturnType<typeof vi.fn> }
let read: ReturnType<typeof vi.fn>
let post: ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(NOON)
  localStorage.clear()
  handle = {
    whenShopsReady: vi.fn(() => Promise.resolve()),
    hintInputs: vi.fn(() => ({ shops: [], near: [], cleared: new Set<string>(), checked: new Set<string>() })),
    setHints: vi.fn(),
    bounceHint: vi.fn(),
  }
  read = vi.fn().mockResolvedValue({ ok: true, set: null })
  post = vi.fn().mockResolvedValue({ ok: true, set: three() })
})
afterEach(() => vi.useRealTimers())

type P = { me: LatLng | null; enabled?: boolean }
const setup = (init: P = { me: at(0) }) =>
  renderHook((p: P) =>
    useDailyHints({
      userId: 'u1', enabled: p.enabled ?? true, me: p.me, home: at(0),
      map: { current: handle as unknown as MapViewHandle },
      api: { readTodayHints: read as never, postDailyHints: post as never },
    }),
    { initialProps: init },
  )
const flush = async () => { await act(async () => { await vi.advanceTimersByTimeAsync(0) }) }
const open = async (r: ReturnType<typeof setup>) => { act(() => r.result.current.openSheet()); await flush() }

test('開いただけでは postDailyHints を呼ばない（読むだけ）。今日の組があればピンを出す', async () => {
  read.mockResolvedValue({ ok: true, set: three() })
  const r = setup()
  await flush()
  expect(post).not.toHaveBeenCalled()
  expect(r.result.current.set?.hints).toHaveLength(3)
  expect(handle.setHints.mock.lastCall![0]).toHaveLength(3)
})

test('openSheet で組が無ければ、そろうのを待って候補を送る。2回目は読み直すだけで送らない', async () => {
  const r = setup()
  await flush()
  await open(r)
  expect(post).toHaveBeenCalledTimes(1)
  expect(post.mock.calls[0][0]).toMatchObject({ regen: false, candidates: { hp: [], osm: [] } })
  expect(r.result.current.status).toBe('ready')
  read.mockResolvedValue({ ok: true, set: three() })
  await open(r)
  expect(post).toHaveBeenCalledTimes(1)
})

test('enabled false → unavailable で送らない', async () => {
  const r = setup({ me: at(0), enabled: false })
  await open(r)
  expect(r.result.current.status).toBe('unavailable')
  expect(post).not.toHaveBeenCalled()
})

test('whenShopsReady が 30 秒で来なければ timeout', async () => {
  handle.whenShopsReady.mockReturnValue(new Promise(() => {}))
  const r = setup()
  await open(r)
  expect(r.result.current.status).toBe('loading')
  await act(async () => { await vi.advanceTimersByTimeAsync(30000) })
  expect(r.result.current.status).toBe('timeout')
  expect(post).not.toHaveBeenCalled()
})

test('速い間は fast で送らず、遅いまま 30 秒続くと送る', async () => {
  const r = setup({ me: at(0) })
  await flush()
  await act(async () => { await vi.advanceTimersByTimeAsync(10000) })
  r.rerender({ me: at(50) }) // 10秒で 50m = 18km/h
  await open(r)
  expect(r.result.current.status).toBe('fast')
  expect(r.result.current.fast).toBe(true)
  expect(post).not.toHaveBeenCalled()
  for (let i = 0; i < 4; i++) {
    await act(async () => { await vi.advanceTimersByTimeAsync(7000) })
    r.rerender({ me: at(50 + i * 0.1) })
  }
  expect(post).not.toHaveBeenCalled() // まだ 28 秒
  await act(async () => { await vi.advanceTimersByTimeAsync(3000) })
  r.rerender({ me: at(51) })
  await flush()
  expect(post).toHaveBeenCalledTimes(1)
})

test('送信の失敗は error、retry で1回だけやり直す', async () => {
  post.mockResolvedValueOnce({ ok: false, reason: 'network' })
  const r = setup()
  await open(r)
  expect(r.result.current.status).toBe('error')
  expect(post).toHaveBeenCalledTimes(1)
  act(() => r.result.current.retry())
  await flush()
  expect(post).toHaveBeenCalledTimes(2)
  expect(r.result.current.status).toBe('ready')
})

test('読み取りが失敗しても（SQL 0004 前）、送って失敗すれば error で落ちない', async () => {
  read.mockResolvedValue({ ok: false })
  post.mockResolvedValue({ ok: false, reason: 'network' })
  const r = setup()
  await open(r)
  expect(r.result.current.status).toBe('error')
})

test('0件なら ready で hints 空、次の openSheet でまた送る', async () => {
  post.mockResolvedValue({ ok: true, set: mkSet([], { generation: 0, regenLeft: 0 }) })
  const r = setup()
  await open(r)
  expect(r.result.current.status).toBe('ready')
  expect(r.result.current.set?.hints).toEqual([])
  await open(r)
  expect(post).toHaveBeenCalledTimes(2)
})

const farMe = at(2200) // 重心(600m)から 1.5km 以上
const withSet = async () => {
  read.mockResolvedValue({ ok: true, set: three() })
  const r = setup({ me: farMe })
  await flush()
  return r
}

test('探し直す: 重心から離れていれば regenVisible。送ると新しい組になり、古い組のピンを消して明かしを捨てる', async () => {
  const r = await withSet()
  expect(r.result.current.regenVisible).toBe(true)
  post.mockResolvedValue({ ok: true, set: mkSet([hint('x', 2000), hint('y', 2100)], { generation: 2, regenLeft: 0 }) })
  act(() => r.result.current.regen())
  await flush()
  expect(post.mock.calls[0][0].regen).toBe(true)
  expect(r.result.current.set?.generation).toBe(2)
  expect(handle.setHints.mock.lastCall![0].map((h: DailyHint) => h.id)).toEqual(['x', 'y'])
  expect(loadRevealed('u1', DAY, 1).size).toBe(0)
  expect(r.result.current.regenVisible).toBe(false)
})

test.each(['regen_used', 'regen_done', 'not_far'])('探し直しの 409 %s でボタンが消え、組を読み直す', async (reason) => {
  const r = await withSet()
  post.mockResolvedValue({ ok: false, reason })
  act(() => r.result.current.regen())
  await flush()
  expect(read).toHaveBeenCalledTimes(2)
  expect(r.result.current.regenVisible).toBe(false)
  expect(r.result.current.set?.hints).toHaveLength(3)
})

test('作り直しで0件なら notice を出し、組はそのまま', async () => {
  const r = await withSet()
  post.mockResolvedValue({ ok: true, set: three() }) // 世代が同じ = 作り直せなかった
  act(() => r.result.current.regen())
  await flush()
  expect(r.result.current.notice).toBe(NO_HINTS_NOTICE)
  expect(r.result.current.set?.generation).toBe(1)
})

test('30m に入ると newlyRevealed と bounceHint、revealStore に保存', async () => {
  read.mockResolvedValue({ ok: true, set: three() })
  const r = setup({ me: at(0) })
  await flush()
  expect(r.result.current.newlyRevealed).toBeNull()
  r.rerender({ me: at(280) }) // 店 a(300m) まで 20m
  await flush()
  expect(r.result.current.newlyRevealed?.id).toBe('a')
  expect(handle.bounceHint).toHaveBeenCalledWith('a')
  expect(loadRevealed('u1', DAY, 1).has('a')).toBe(true)
  act(() => r.result.current.clearNewly())
  expect(r.result.current.newlyRevealed).toBeNull()
})

test('markCompleted で達成になり、regenVisible が false', async () => {
  const r = await withSet()
  const a = r.result.current.set!.hints[0]
  act(() => r.result.current.markCompleted(shopOf(a)))
  expect(r.result.current.set!.hints[0].completed).toBe(true)
  expect(r.result.current.regenVisible).toBe(false)
  expect(r.result.current.revealed.has('a')).toBe(true)
})

test('isMasked: 未明かし・未達成の気配の店 → true。明かした・達成・気配でない店 → false', async () => {
  read.mockResolvedValue({ ok: true, set: three() })
  const r = setup({ me: at(0) })
  await flush()
  const [a, b] = r.result.current.set!.hints
  expect(r.result.current.isMasked(shopOf(a))).toBe(true)
  expect(r.result.current.isMasked({ ...shopOf(a), id: 'hp:other', name: '別', lat: 36 })).toBe(false)
  r.rerender({ me: at(290) })
  await flush()
  expect(r.result.current.isMasked(shopOf(a))).toBe(false) // 明かした
  act(() => r.result.current.markCompleted(shopOf(b)))
  expect(r.result.current.isMasked(shopOf(b))).toBe(false) // 達成
})

test('日付が変わったら（1分ごと）組・明かしを消す', async () => {
  read.mockResolvedValue({ ok: true, set: three() })
  const r = setup({ me: at(0) })
  await flush()
  expect(r.result.current.set).not.toBeNull()
  vi.setSystemTime(new Date('2026-11-07T15:00:30Z')) // 日本時間で翌日 0:00:30
  await act(async () => { await vi.advanceTimersByTimeAsync(60000) })
  expect(r.result.current.set).toBeNull()
  expect(r.result.current.revealed.size).toBe(0)
  expect(handle.setHints.mock.lastCall![0]).toEqual([])
})

test('読んだ組の day が今日でなければ捨てる', async () => {
  read.mockResolvedValue({ ok: true, set: mkSet([hint('a', 300)], { day: '2026-11-06' }) })
  const r = setup()
  await flush()
  expect(r.result.current.set).toBeNull()
  await open(r)
  expect(post).toHaveBeenCalledTimes(1) // 昨日の組は使わず、作る
})
