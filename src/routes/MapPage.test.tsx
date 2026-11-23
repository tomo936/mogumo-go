import { loading } from '../credits/loadingGate.ts'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { AuthContext } from '../auth/AuthContext.ts'
import type { LatLng } from '../map/domain/geo.ts'
import type { LocationEvent } from '../map/domain/locationStatus.ts'
import type { Shop } from '../shops/domain/shop.ts'
import { EFFECT_MS } from '../checkin/ui/CheckinEffect.tsx'
import { MapPage } from './MapPage.tsx'

vi.mock('../checkin/ui/confetti.ts', () => ({ startConfetti: () => () => {} }))
vi.mock('../lib/supabase.ts', () => ({ supabase: {} }))
vi.mock('../guide/infra/poko.ts', () => ({ mountPoko: () => Promise.reject(new Error('jsdom')), preloadPoko: () => Promise.resolve() }))
const mounts: ((e: LocationEvent) => void)[] = []
const shopErrors: (() => void)[] = []
const handlers: { select: (s: Shop | null) => void; building: (s: Shop[] | null) => void; position: (p: LatLng) => void }[] = []
const checkinCalls: { id: string; cells: unknown[] }[] = []
const expressCalls: string[] = []
const unfocusCalls: number[] = []
const postCheckin = vi.fn()
vi.mock('../checkin/infra/checkinApi.ts', () => ({ postCheckin: (...a: unknown[]) => postCheckin(...a), loadProgress: () => Promise.resolve({ visitsByShop: new Map() }) }))
const loadSummary = vi.fn(async (_id: string): Promise<{ avg: number; count: number } | null> => null)
const loadLatest = vi.fn(async (_id: string) => [] as unknown[])
const loadMine = vi.fn(async (_id: string): Promise<{ visits: { checkinId: string; checkedInAt: string }[]; mine: unknown[] }> => ({ visits: [], mine: [] }))
vi.mock('../reviews/infra/reviewsApi.ts', () => ({
  loadMine: (id: string) => loadMine(id),
  photoUrls: async () => new Map(),
  loadSummary: (id: string) => loadSummary(id),
  loadLatest: (id: string) => loadLatest(id),
  saveReview: async () => { throw new Error('x') },
  deleteReview: async () => {},
}))
const syncOsmShops = vi.fn(async (..._a: unknown[]) => {})
vi.mock('../zukan/infra/osmSync.ts', () => ({ syncOsmShops: (...a: unknown[]) => syncOsmShops(...a) }))
const claimLoginBonus = vi.fn(() => Promise.resolve(null as { stampNo: number; coins: number; claimedNow: boolean } | null))
vi.mock('../loginbonus/infra/loginBonusApi.ts', () => ({ claimLoginBonus: (...a: unknown[]) => (claimLoginBonus as (...x: unknown[]) => unknown)(...a) }))
vi.mock('../mypage/infra/coins.ts', () => ({ loadCoins: () => Promise.resolve(420) }))
const syncMissions = vi.fn()
vi.mock('../missions/infra/missionsApi.ts', () => ({ syncMissions: (...a: unknown[]) => syncMissions(...a) }))
const readTodayHints = vi.fn()
const postDailyHints = vi.fn()
vi.mock('../hints/infra/hintsApi.ts', () => ({
  readTodayHints: (...a: unknown[]) => readTodayHints(...a),
  postDailyHints: (...a: unknown[]) => postDailyHints(...a),
}))
const syncUntilSettled = vi.fn()
vi.mock('../towns/infra/townsApi.ts', () => ({ syncUntilSettled: (...a: unknown[]) => syncUntilSettled(...a) }))
const addTownCalls: string[] = []
const hintTaps: ((id: string) => void)[] = []
const focusAtCalls: LatLng[] = []
let mapShopsNow: Shop[] = []
let visitsNow: { count: number; firstDay: string; lastDay: string } | null = null
afterEach(() => vi.useRealTimers())
beforeEach(() => {
  loading.reset() // タイトルを閉じたかは前のテストから持ち越さない
  localStorage.clear()
  readTodayHints.mockReset()
  readTodayHints.mockResolvedValue({ ok: true, set: null })
  postDailyHints.mockReset()
  mapShopsNow = []
  visitsNow = null
  focusAtCalls.length = 0
  syncUntilSettled.mockReset()
  syncUntilSettled.mockResolvedValue(undefined)
  syncMissions.mockReset()
  syncMissions.mockResolvedValue(null)
  addTownCalls.length = 0
  expressCalls.length = 0
})
const northCalls: number[] = []
const introCalls: number[] = []
let introDoneCb: (() => void) | undefined // 空から降り終わった合図（地図の画面が呼ぶ）
vi.mock('../map/ui/MapView.tsx', async () => {
  const { useEffect, useImperativeHandle } = await import('react')
  return {
    MapView: ({ pinsHidden, paused, onStatus, onShopsError, onSelectShop, onSelectBuilding, onPosition, onHintTap, ref }: {
      onStatus: (e: LocationEvent) => void; onShopsError: () => void
      onSelectShop: (s: Shop | null) => void; onSelectBuilding: (s: Shop[] | null) => void; onPosition: (p: LatLng) => void
      onHintTap: (id: string) => void; pinsHidden?: boolean; paused?: boolean
      ref?: React.Ref<{ checkin(shop: Shop, cells: unknown[]): void; addTown(town: { id: string }): void }>
    }) => {
      useEffect(() => { mounts.push(onStatus) }, [onStatus])
      useEffect(() => { shopErrors.push(onShopsError) }, [onShopsError])
      useEffect(() => { hintTaps.push(onHintTap) }, [onHintTap])
      useEffect(() => { handlers.push({ select: onSelectShop, building: onSelectBuilding, position: onPosition }) }, [onSelectShop, onSelectBuilding, onPosition])
      useImperativeHandle(ref, () => ({ checkin: (shop, cells) => { checkinCalls.push({ id: shop.id, cells }) }, addTown: (town: { id: string }) => { addTownCalls.push(town.id) }, unfocus: () => { unfocusCalls.push(1) }, isCheckedToday: () => false, visitsFor: () => visitsNow, progressReady: () => true, checked: () => new Set<string>(),
        hintInputs: () => ({ shops: mapShopsNow, near: mapShopsNow, cleared: new Set<string>(), checked: new Set<string>() }),
        whenShopsReady: () => Promise.resolve(), setHints: () => {}, bounceHint: () => {}, express: (k: string) => { expressCalls.push(k) }, subscribeBearing: () => () => {}, resetNorth: () => { northCalls.push(1) }, intro: (cb?: (aborted?: boolean) => void) => { introCalls.push(1); introDoneCb = cb as () => void }, focusAt: (p: LatLng) => { focusAtCalls.push(p) },
      }), [])
      return <div data-testid="map-view" data-pins-hidden={String(pinsHidden)} data-paused={String(!!paused)} />
    },
  }
})

test('見つからない → もう一度試す で探索中に戻り、地図を作り直す', async () => {
  render(
    <AuthContext.Provider value={{ session: null, loading: false, signInWithGoogle: vi.fn(), signInAsGuest: vi.fn(), linkGoogle: vi.fn(), signOut: vi.fn() }}>
      <MapPage />
    </AuthContext.Provider>,
  )
  const before = mounts.length
  act(() => mounts[mounts.length - 1]({ type: 'firstFixTimeout' }))
  expect(screen.getByText('現在地が見つかりません')).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'もう一度試す' }))
  expect(screen.getByText('現在地を探しています…')).toBeInTheDocument()
  expect(mounts.length).toBeGreaterThan(before)
})

test('お店の取得に失敗すると帯が出る', () => {
  render(
    <AuthContext.Provider value={{ session: null, loading: false, signInWithGoogle: vi.fn(), signInAsGuest: vi.fn(), linkGoogle: vi.fn(), signOut: vi.fn() }}>
      <MapPage />
    </AuthContext.Provider>,
  )
  expect(screen.queryByText('お店を読み込めませんでした')).not.toBeInTheDocument()
  act(() => shopErrors[shopErrors.length - 1]())
  expect(screen.getByText('お店を読み込めませんでした')).toBeInTheDocument()
})

const shop: Shop = { id: 'hp:J1', name: '麺屋もぐも', lat: 35, lng: 139, kind: 'ramen', details: null, mapId: null }
const here: LatLng = { lat: 35, lng: 139 }
const renderPage = () =>
  render(
    <AuthContext.Provider value={{ session: null, loading: false, signInWithGoogle: vi.fn(), signInAsGuest: vi.fn(), linkGoogle: vi.fn(), signOut: vi.fn() }}>
      <MapPage />
    </AuthContext.Provider>,
  )
const last = () => handlers[handlers.length - 1]

test('お店をタップするとシートが出て、チェックインが成功すると閉じる', async () => {
  postCheckin.mockResolvedValue({ ok: true, checkinId: 'c1', coins: 30, newCells: [{ x: 1, y: 2 }] })
  renderPage()
  act(() => last().position(here))
  act(() => last().select(shop))
  expect(screen.getByText('麺屋もぐも')).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'チェックイン' }))
  expect(postCheckin).toHaveBeenCalledWith({ shopId: 'hp:J1', me: here, farFromHome: false })
  expect(screen.queryByText('麺屋もぐも')).not.toBeInTheDocument()
  expect(checkinCalls).toEqual([{ id: 'hp:J1', cells: [{ x: 1, y: 2 }] }])
  expect(expressCalls).toEqual(['happy']) // 3D の男の子が喜ぶ（1 回）
  expect(screen.getByText('チェックイン完了')).toBeInTheDocument()
  expect(screen.getByText('+30 コイン')).toBeInTheDocument()
})

test('失敗するとシートに文言が出て、閉じない。通信中は2回押せない', async () => {
  let resolve!: (v: unknown) => void
  postCheckin.mockReset()
  postCheckin.mockReturnValue(new Promise((r) => { resolve = r }))
  renderPage()
  act(() => last().position(here))
  act(() => last().select(shop))
  const btn = screen.getByRole('button', { name: 'チェックイン' })
  await userEvent.click(btn)
  await userEvent.click(btn)
  expect(postCheckin).toHaveBeenCalledTimes(1)
  await act(async () => resolve({ ok: false, reason: 'too_far' }))
  expect(screen.getByText('お店から50mより遠いようです')).toBeInTheDocument()
  expect(screen.getByText('麺屋もぐも')).toBeInTheDocument()
})

test('何もない所をタップするとシートが閉じる', () => {
  renderPage()
  act(() => last().position(here))
  act(() => last().select(shop))
  act(() => last().select(null))
  expect(screen.queryByText('麺屋もぐも')).not.toBeInTheDocument()
})

const shop2: Shop = { id: 'hp:J2', name: '別のお店', lat: 35, lng: 139, kind: 'cafe', details: null, mapId: null }

test('通信中は別のお店をタップしてもシートが入れ替わらず、失敗してもそのお店のシートは残る', async () => {
  let resolve!: (v: unknown) => void
  postCheckin.mockReset()
  postCheckin.mockReturnValue(new Promise((r) => { resolve = r }))
  renderPage()
  act(() => last().position(here))
  act(() => last().select(shop))
  await userEvent.click(screen.getByRole('button', { name: 'チェックイン' }))
  act(() => last().select(shop2))
  expect(screen.getByText('麺屋もぐも')).toBeInTheDocument()
  expect(screen.queryByText('別のお店')).not.toBeInTheDocument()
  await act(async () => resolve({ ok: false, reason: 'network' }))
  expect(screen.getByText('麺屋もぐも')).toBeInTheDocument()
})

test('シートの onCheckin を同期で2回呼んでも postCheckin は1回', async () => {
  postCheckin.mockReset()
  postCheckin.mockReturnValue(new Promise(() => {}))
  renderPage()
  act(() => last().position(here))
  act(() => last().select(shop))
  const btn = screen.getByRole('button', { name: 'チェックイン' })
  act(() => { fireEvent.click(btn); fireEvent.click(btn) })
  expect(postCheckin).toHaveBeenCalledTimes(1)
})

const startBusy = async () => {
  let resolve!: (v: unknown) => void
  postCheckin.mockReset()
  postCheckin.mockReturnValue(new Promise((r) => { resolve = r }))
  renderPage()
  act(() => last().position(here))
  act(() => last().select(shop))
  await userEvent.click(screen.getByRole('button', { name: 'チェックイン' }))
  act(() => last().select(null)) // 通信中にシートを閉じる
  expect(screen.queryByText('麺屋もぐも')).not.toBeInTheDocument()
  return resolve
}

test('通信中にシートを閉じて成功 → シートは戻らず、演出は出る', async () => {
  const resolve = await startBusy()
  await act(async () => resolve({ ok: true, checkinId: 'c1', coins: 30, newCells: [] }))
  expect(screen.queryByText('麺屋もぐも')).not.toBeInTheDocument()
  expect(screen.queryByRole('region', { name: 'お店の情報' })).not.toBeInTheDocument()
  expect(screen.getByText('チェックイン完了')).toBeInTheDocument()
})

test('通信中にシートを閉じて失敗 → エラーも出ず、シートも戻らない。次に開くとエラーは残っていない', async () => {
  const resolve = await startBusy()
  await act(async () => resolve({ ok: false, reason: 'network' }))
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  expect(screen.queryByRole('region', { name: 'お店の情報' })).not.toBeInTheDocument()
  act(() => last().select(shop))
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})

test('地図の画面にはクレジットを出さない（出典は設定の中・スプラッシュ）', () => {
  render(
    <AuthContext.Provider value={{ session: null, loading: false, signInWithGoogle: vi.fn(), signInAsGuest: vi.fn(), linkGoogle: vi.fn(), signOut: vi.fn() }}>
      <MapPage />
    </AuthContext.Provider>,
  )
  expect(screen.queryByText('Powered by ホットペッパーグルメ Webサービス')).not.toBeInTheDocument()
})

test('一覧で店を選ぶと、一覧が閉じてお店のシートが出る', async () => {
  render(
    <AuthContext.Provider value={{ session: null, loading: false, signInWithGoogle: vi.fn(), signInAsGuest: vi.fn(), linkGoogle: vi.fn(), signOut: vi.fn() }}>
      <MapPage />
    </AuthContext.Provider>,
  )
  const a: Shop = { id: 'a', name: 'カフェ花', lat: 35, lng: 139, kind: 'cafe', details: null, mapId: null }
  const b: Shop = { id: 'b', name: 'らーめん太郎', lat: 35, lng: 139, kind: 'ramen', details: null, mapId: null }
  act(() => handlers[handlers.length - 1].position({ lat: 35, lng: 139 }))
  act(() => handlers[handlers.length - 1].building([a, b]))
  expect(screen.getByRole('region', { name: 'ビルのお店' })).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: /らーめん太郎/ }))
  expect(screen.queryByRole('region', { name: 'ビルのお店' })).toBeNull()
  expect(screen.getByRole('region', { name: 'お店の情報' })).toBeInTheDocument()
  // 「‹ このビル」でビルの一覧に戻れる
  await userEvent.click(screen.getByRole('button', { name: 'このビル' }))
  expect(screen.getByRole('region', { name: 'ビルのお店' })).toBeInTheDocument()
  expect(screen.queryByRole('region', { name: 'お店の情報' })).toBeNull()
  // × はお店もビルも閉じる
  await userEvent.click(screen.getByRole('button', { name: /カフェ花/ }))
  await userEvent.click(screen.getByRole('button', { name: '閉じる' }))
  expect(screen.queryByRole('region', { name: 'ビルのお店' })).toBeNull()
  expect(screen.queryByRole('region', { name: 'お店の情報' })).toBeNull()
})


// ---- 気配 ----
const hintShop: Shop = { id: 'hp:S1', name: '麺屋かくれ', lat: 35, lng: 139, kind: 'ramen', details: null, mapId: null }
const hintA = {
  id: 'h1', slot: 1, shopId: 'hp:S1', genre: '中華', catch: '自家製麺', budget: '1,000円台', isMystery: false, completed: false,
  shop: { name: '麺屋かくれ', lat: 35, lng: 139 },
}
const todaySet = (hints = [hintA]) => ({ day: '2026-11-07', generation: 1, regenLeft: 1 as const, hints })
const farAway: LatLng = { lat: 35.002, lng: 139 } // 約220m
const withHints = async (hints = [hintA], at: LatLng = farAway) => {
  readTodayHints.mockResolvedValue({ ok: true, set: todaySet(hints) })
  mapShopsNow = [hintShop]
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-07T03:00:00Z'))
  renderPage()
  act(() => last().position(at))
  await act(async () => { await Promise.resolve() })
}

test('気配ボタンでシートが開き、店名が出ない', async () => {
  await withHints()
  await userEvent.click(screen.getByRole('button', { name: /気配/ }))
  expect(screen.getByRole('region', { name: '探索' })).toBeInTheDocument()
  expect(await screen.findByText('中華？')).toBeInTheDocument()
  expect(document.body.textContent).not.toContain('麺屋かくれ')
})

test('気配を押すと focusAt とヒントのシート。閉じると unfocus', async () => {
  await withHints()
  await userEvent.click(screen.getByRole('button', { name: /気配/ }))
  await userEvent.click(await screen.findByRole('button', { name: /中華？/ }))
  expect(focusAtCalls).toHaveLength(1)
  expect(screen.getByRole('region', { name: '気配' })).toBeInTheDocument()
  expect(screen.queryByRole('region', { name: '探索' })).toBeNull()
  expect(screen.getByText('霧の中の気配')).toBeInTheDocument()
  const n = unfocusCalls.length
  await userEvent.click(screen.getByRole('button', { name: '閉じる' }))
  expect(unfocusCalls.length).toBeGreaterThan(n)
})

test('地図の気配のピンを押してもヒントのシートが開く', async () => {
  await withHints()
  act(() => hintTaps[hintTaps.length - 1]('h1'))
  expect(screen.getByRole('region', { name: '気配' })).toBeInTheDocument()
})

test('明かした気配を押すとお店のシート（名前が出る）', async () => {
  await withHints([hintA], { lat: 35.0001, lng: 139 }) // 約11m = 30m 以内で明かす
  await act(async () => { await Promise.resolve() })
  act(() => last().position({ lat: 35.0001, lng: 139 }))
  act(() => hintTaps[hintTaps.length - 1]('h1'))
  expect(screen.getByRole('region', { name: 'お店の情報' })).toBeInTheDocument()
  expect(screen.getByText('麺屋かくれ')).toBeInTheDocument()
})

test('伏せた気配の店のシートは「？？？」で、チェックインできる。成功すると演出に正体が出て達成になる', async () => {
  postCheckin.mockReset()
  postCheckin.mockResolvedValue({ ok: true, checkinId: 'c1', coins: 40, wasHint: true, newCells: [] })
  await withHints([hintA], { lat: 35.0004, lng: 139 }) // 約44m = 30m の外・50m の内
  act(() => last().select(hintShop))
  expect(screen.getByText('？？？')).toBeInTheDocument()
  expect(screen.queryByText('麺屋かくれ')).toBeNull()
  expect(screen.getByText('気配の店 +10')).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'チェックイン' }))
  expect(screen.getByText('『麺屋かくれ』だった！')).toBeInTheDocument()
  expect(screen.getByText('+40 コイン（気配ボーナス +10）')).toBeInTheDocument()
  // 達成になり、探索ボタンの数字が消える
  expect(screen.queryByText('1')).toBeNull()
})

test('チェックインが失敗（too_far）したら正体を出さない', async () => {
  postCheckin.mockReset()
  postCheckin.mockResolvedValue({ ok: false, reason: 'too_far' })
  await withHints([hintA], { lat: 35.0004, lng: 139 })
  act(() => last().select(hintShop))
  await userEvent.click(screen.getByRole('button', { name: 'チェックイン' }))
  expect(screen.queryByText(/だった！/)).toBeNull()
  expect(screen.queryByText('麺屋かくれ')).toBeNull()
})

test('ビルの一覧でも、伏せた気配の店は「？？？」', async () => {
  await withHints([hintA], { lat: 35.0004, lng: 139 })
  const other: Shop = { id: 'hp:Z', name: 'ふつうの店', lat: 35, lng: 139, kind: 'cafe', details: null, mapId: null }
  act(() => last().building([hintShop, other]))
  expect(screen.getByText('ふつうの店')).toBeInTheDocument()
  expect(screen.queryByText('麺屋かくれ')).toBeNull()
  expect(screen.getByText('？？？')).toBeInTheDocument()
})

test('30m に入ると帯「気配の正体は…『○○』！」が出る', async () => {
  await withHints([hintA], farAway)
  expect(screen.queryByText(/気配の正体は/)).toBeNull()
  act(() => last().position({ lat: 35.0001, lng: 139 }))
  await act(async () => { await Promise.resolve() })
  expect(screen.getByText('気配の正体は…『麺屋かくれ』！')).toBeInTheDocument()
})

test('右上は方位磁針: 押すと北を上に戻す。ピンを出さない設定（端末に覚えた分）は地図に渡る', async () => {
  localStorage.setItem('mogumo.pinsHidden', '1')
  render(
    <AuthContext.Provider value={{ session: null, loading: false, signInWithGoogle: vi.fn(), signInAsGuest: vi.fn(), linkGoogle: vi.fn(), signOut: vi.fn() }}>
      <MapPage />
    </AuthContext.Provider>,
  )
  expect(screen.getByTestId('map-view')).toHaveAttribute('data-pins-hidden', 'true')
  expect(screen.queryByRole('button', { name: 'ピンを隠す' })).not.toBeInTheDocument()
  const before = northCalls.length
  await userEvent.click(screen.getByRole('button', { name: '北を上にして自分の場所に戻る' }))
  expect(northCalls.length).toBe(before + 1)
  localStorage.removeItem('mogumo.pinsHidden')
})

test('タイトルを閉じて地図に入ったら、カメラを空から降ろす（intro）', async () => {
  renderPage()
  const before = introCalls.length
  act(() => loading.enter())
  expect(introCalls.length).toBe(before + 1)
})

test('設定など全画面の画面を開いているあいだは、後ろの地図を止める', async () => {
  renderPage()
  expect(screen.getByTestId('map-view')).toHaveAttribute('data-paused', 'false')
  await userEvent.click(screen.getByRole('button', { name: 'メニュー' }))
  await userEvent.click(screen.getByRole('button', { name: '設定' }))
  expect(screen.getByTestId('map-view')).toHaveAttribute('data-paused', 'true')
})

test('チェックインのあと、持っているコインが地図の上に出る', async () => {
  postCheckin.mockResolvedValue({ ok: true, checkinId: 'c1', coins: 30, newCells: [] })
  syncUntilSettled.mockResolvedValue(undefined)
  renderPage()
  act(() => last().position(here))
  act(() => last().select(shop))
  await userEvent.click(screen.getByRole('button', { name: 'チェックイン' }))
  expect(await screen.findByRole('img', { name: 'コイン 420' })).toBeInTheDocument()
})

test('チェックインで経験値: 初めてのお店は +10、Lv が上がるときは「Lv 2 になった！」', async () => {
  postCheckin.mockResolvedValue({ ok: true, checkinId: 'c1', coins: 30, newCells: [] })
  renderPage()
  act(() => last().position(here))
  act(() => last().select(shop))
  await userEvent.click(screen.getByRole('button', { name: 'チェックイン' }))
  expect(await screen.findByText('+10 EXP')).toBeInTheDocument()
})

// ---- 週ミッション ----
const week = (o: { progress?: number; completed?: boolean; newly?: string[] } = {}) => ({
  weekEnd: '2026-11-15', newly: o.newly ?? [],
  missions: [
    { id: 'm1', difficulty: 'easy', type: 'hint_shop', key: 'hint_trail', kinds: [], target: 1, progress: o.progress ?? 0, reward: 50, completed: o.completed ?? false },
    { id: 'm2', difficulty: 'normal', type: 'first_visit', key: 'kaitaku', kinds: [], target: 3, progress: 1, reward: 100, completed: false },
    { id: 'm3', difficulty: 'hard', type: 'weekend', key: 'weekend', kinds: [], target: 3, progress: 0, reward: 150, completed: false },
  ],
})

test('気配のシートを開くと、出題つきで週ミッションを読み、チケット3枚を出す', async () => {
  syncMissions.mockResolvedValue(week())
  renderPage()
  await userEvent.click(screen.getByRole('button', { name: '気配' }))
  expect(await screen.findByRole('button', { name: /かんたん 気配をたどって 0\/1 50コイン/ })).toBeInTheDocument()
  expect(syncMissions.mock.calls[0][0]).toEqual(expect.objectContaining({ hasHome: expect.any(Boolean), kinds: expect.any(Object) }))
  await userEvent.click(screen.getByRole('button', { name: /ふつう 開拓日和/ }))
  expect(screen.getByText('はじめてのお店に3軒。達成で 100 コイン')).toBeInTheDocument()
})

test('週ミッションが読めなければ「もう一度」。気配のシートは出たまま', async () => {
  renderPage()
  await userEvent.click(screen.getByRole('button', { name: '気配' }))
  expect(await screen.findByText('ミッションを読めませんでした')).toBeInTheDocument()
  syncMissions.mockResolvedValue(week())
  await userEvent.click(screen.getAllByRole('button', { name: 'もう一度' }).at(-1)!)
  expect(await screen.findByRole('button', { name: /かんたん 気配をたどって/ })).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: '今日の気配' })).toBeInTheDocument()
})

test('チェックインのあと数え直し（出題なし）、達成したら演出のあとに帯', async () => {
  postCheckin.mockResolvedValue({ ok: true, checkinId: 'c1', coins: 30, newCells: [] })
  syncMissions.mockResolvedValue(week({ progress: 1, completed: true, newly: ['m1'] }))
  renderPage()
  act(() => last().position(here))
  act(() => last().select(shop))
  await userEvent.click(screen.getByRole('button', { name: 'チェックイン' }))
  expect(syncMissions).toHaveBeenCalledWith(null)
  expect(screen.queryByText('ミッション達成！')).not.toBeInTheDocument() // 演出の間は待つ
})

// ---- 町のクリア・コンプリート ----
const townShape = { id: '13112-経堂', name: '経堂', city: '世田谷区', areaM2: 500000, at: 1, geom: { type: 'Polygon' as const, coordinates: [[[139, 35], [139.01, 35], [139.01, 35.01], [139, 35]]] }, bbox: [139, 35, 139.01, 35.01] as [number, number, number, number] }

test('チェックインのあと町の進み具合を確かめ、クリアが返ると帯が出て町の霧を晴らす。続けてコンプリートの帯', async () => {
  postCheckin.mockResolvedValue({ ok: true, checkinId: 'c1', coins: 30, newCells: [] })
  let update!: (s: unknown) => void
  syncUntilSettled.mockImplementation(async (onUpdate: (s: unknown) => void) => { update = onUpdate })
  renderPage()
  act(() => last().position(here))
  act(() => last().select(shop))
  await userEvent.click(screen.getByRole('button', { name: 'チェックイン' }))
  expect(syncUntilSettled).toHaveBeenCalledTimes(1)
  expect(screen.queryByText('経堂 クリア！')).not.toBeInTheDocument()
  const newly = [
    { id: '13112-経堂', name: '経堂', kind: 'clear', coins: 100, town: townShape },
    { id: '13112-経堂', name: '経堂', kind: 'complete', coins: 0, town: null },
  ]
  act(() => update({ towns: [], newly, more: true }))
  expect(screen.getByText('経堂 クリア！')).toBeInTheDocument()
  expect(screen.getByText('+100')).toBeInTheDocument()
  expect(addTownCalls).toEqual(['13112-経堂'])
  // 同じ知らせがもう一度来ても、二重に出さない
  act(() => update({ towns: [], newly, more: false }))
  expect(addTownCalls).toEqual(['13112-経堂'])
  // 帯を閉じると次（コンプリート）、その次は無い
  fireEvent.click(screen.getByText('経堂 クリア！'))
  expect(screen.getByText('経堂 コンプリート！')).toBeInTheDocument()
  fireEvent.click(screen.getByText('経堂 コンプリート！'))
  expect(screen.queryByText('経堂 コンプリート！')).not.toBeInTheDocument()
  expect(screen.queryByText('経堂 クリア！')).not.toBeInTheDocument()
})

test('町の確かめが何も返さなくても、チェックインの演出は出る。失敗したチェックインでは確かめない', async () => {
  postCheckin.mockResolvedValue({ ok: true, checkinId: 'c1', coins: 30, newCells: [] })
  renderPage()
  act(() => last().position(here))
  act(() => last().select(shop))
  await userEvent.click(screen.getByRole('button', { name: 'チェックイン' }))
  expect(screen.getByText('チェックイン完了')).toBeInTheDocument()
  expect(syncUntilSettled).toHaveBeenCalledTimes(1)
  syncUntilSettled.mockClear()
  postCheckin.mockResolvedValue({ ok: false, reason: 'too_far' })
  act(() => last().select({ ...shop, id: 'hp:J2' }))
  await userEvent.click(screen.getByRole('button', { name: 'チェックイン' }))
  expect(syncUntilSettled).not.toHaveBeenCalled()
})

test('画面を離れたら、町の呼び直しは止まる（alive が false）', async () => {
  postCheckin.mockResolvedValue({ ok: true, checkinId: 'c1', coins: 30, newCells: [] })
  const { unmount } = renderPage()
  act(() => last().position(here))
  act(() => last().select(shop))
  await userEvent.click(screen.getByRole('button', { name: 'チェックイン' }))
  const opts = syncUntilSettled.mock.calls[0][1] as { alive: () => boolean }
  expect(opts.alive()).toBe(true)
  unmount()
  expect(opts.alive()).toBe(false)
})

// ---- 感想を書く（お店のシートのチェックインのとなり。2026-11-13 オーナー） ----
test('チェックインのあと、地図の上に浮くボタンは出ない', async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
  postCheckin.mockReset()
  postCheckin.mockResolvedValue({ ok: true, checkinId: 'c1', coins: 30, newCells: [] })
  renderPage()
  act(() => last().position(here))
  act(() => last().select(shop))
  await user.click(screen.getByRole('button', { name: 'チェックイン' }))
  await screen.findByText('チェックイン完了')
  act(() => { vi.advanceTimersByTime(EFFECT_MS + 50) })
  expect(screen.queryByRole('button', { name: '感想を書く' })).not.toBeInTheDocument()
})

test('行ったお店のシートの「感想」で、いちばん新しい訪問のエディターが開く', async () => {
  loadMine.mockResolvedValueOnce({ visits: [{ checkinId: 'c9', checkedInAt: '2026-11-12T03:00:00Z' }], mine: [] })
  visitsNow = { count: 1, firstDay: '2026-11-12', lastDay: '2026-11-12' }
  renderPage()
  act(() => last().position(here))
  act(() => last().select(shop))
  await userEvent.click(await screen.findByRole('button', { name: '感想を書く' }))
  expect(loadMine).toHaveBeenCalledWith('hp:J1')
  expect(await screen.findByRole('dialog', { name: '感想を書く' })).toHaveTextContent('2026.11.12 の訪問')
})

test('シートを開くとみんなの感想を読む。店が替われば古い返事は捨てる', async () => {
  let slow: (v: { avg: number; count: number }) => void = () => {}
  loadSummary.mockReset()
  loadSummary.mockImplementation((id: string) => (id === 'hp:J1' ? new Promise((r) => { slow = r }) : Promise.resolve({ avg: 3.5, count: 2 })))
  loadLatest.mockReset()
  loadLatest.mockResolvedValue([])
  renderPage()
  act(() => last().position(here))
  act(() => last().select(shop))
  expect(loadSummary).toHaveBeenCalledWith('hp:J1')
  const other: Shop = { ...shop, id: 'hp:J2', name: 'カフェもぐ' }
  act(() => last().select(other))
  await userEvent.click(screen.getByRole('button', { name: 'くわしく見る' }))
  expect(await screen.findByText('みんなの感想 ★3.5（2件）')).toBeInTheDocument()
  await act(async () => { slow({ avg: 1, count: 1 }) })
  expect(screen.queryByText('みんなの感想 ★1.0（1件）')).not.toBeInTheDocument()
})

// ---- 図鑑に地図のお店を出す（2026-11-13） ----
test('図鑑を開くと、地図のお店のタイルを送り、地図のお店と晴れたマスを図鑑に渡す', async () => {
  syncOsmShops.mockClear()
  const takoyaki: Shop = { id: 'osm:5', name: 'たこ焼き ころ', lat: 35, lng: 139, kind: 'takoyaki', details: null, mapId: null }
  mapShopsNow = [takoyaki]
  render(
    <AuthContext.Provider value={{ session: { user: { id: 'u1' } } as never, loading: false, signInWithGoogle: vi.fn(), signInAsGuest: vi.fn(), linkGoogle: vi.fn(), signOut: vi.fn() }}>
      <MapPage />
    </AuthContext.Provider>,
  )
  await userEvent.click(screen.getByRole('button', { name: 'メニュー' }))
  await userEvent.click(screen.getByRole('button', { name: '図鑑' }))
  expect(syncOsmShops).toHaveBeenCalledWith('u1', expect.any(Set))
})

// ---- 近くのお店の一覧（A11、2026-11-16） ----
test('右上のボタンで近くのお店の一覧が開き、お店を押すとお店のシートが開く', async () => {
  const ramen: Shop = { id: 'osm:9', name: 'らーめん ちかく', lat: 35.0001, lng: 139, kind: 'ramen', details: null, mapId: null }
  mapShopsNow = [ramen]
  render(
    <AuthContext.Provider value={{ session: { user: { id: 'u1' } } as never, loading: false, signInWithGoogle: vi.fn(), signInAsGuest: vi.fn(), linkGoogle: vi.fn(), signOut: vi.fn() }}>
      <MapPage />
    </AuthContext.Provider>,
  )
  act(() => handlers[handlers.length - 1].position({ lat: 35, lng: 139 })) // 店の 11m 手前（霧の中でも 50m 以内は出す）
  await userEvent.click(screen.getByRole('button', { name: '近くのお店' }))
  expect(screen.getByRole('heading', { name: '近くのお店' })).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: /らーめん ちかく/ }))
  await waitFor(() => expect(screen.queryByRole('heading', { name: '近くのお店' })).not.toBeInTheDocument()) // 右へ滑ってから閉じる
  expect(screen.getByText('らーめん ちかく')).toBeInTheDocument()
})

// ---- ログインボーナス（A4、2026-11-17） ----
test('地図へ入ると今日の分を受け取り、少しあとに受け取り画面が出る（受け取り済みなら出ない）', async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  claimLoginBonus.mockReset()
  claimLoginBonus.mockResolvedValueOnce({ stampNo: 2, coins: 10, claimedNow: true })
  localStorage.setItem('mogumo.tutorial.u1', '1') // ポコタンの案内は見たことにする
  render(
    <AuthContext.Provider value={{ session: { user: { id: 'u1' } } as never, loading: false, signInWithGoogle: vi.fn(), signInAsGuest: vi.fn(), linkGoogle: vi.fn(), signOut: vi.fn() }}>
      <MapPage />
    </AuthContext.Provider>,
  )
  expect(claimLoginBonus).not.toHaveBeenCalled() // タイトルを閉じる前は受け取らない
  await act(async () => { loading.enter() })
  expect(claimLoginBonus).toHaveBeenCalledTimes(1)
  expect(screen.queryByRole('dialog', { name: 'ログインボーナス' })).not.toBeInTheDocument() // 空から降りる演出のあいだは出さない
  await act(async () => { vi.advanceTimersByTime(3300) })
  expect(screen.getByRole('dialog', { name: 'ログインボーナス' })).toBeInTheDocument()
  vi.useRealTimers()
})

test('初めての人は、空から降りたあとにポコタンの案内が出て、閉じてからログインボーナス。2 回目は出ない', async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  claimLoginBonus.mockReset()
  claimLoginBonus.mockResolvedValue({ stampNo: 1, coins: 10, claimedNow: true })
  render(
    <AuthContext.Provider value={{ session: { user: { id: 'u1' } } as never, loading: false, signInWithGoogle: vi.fn(), signInAsGuest: vi.fn(), linkGoogle: vi.fn(), signOut: vi.fn() }}>
      <MapPage />
    </AuthContext.Provider>,
  )
  await act(async () => { loading.enter() })
  expect(claimLoginBonus).not.toHaveBeenCalled() // 案内が終わるまで受け取らない
  await act(async () => { vi.advanceTimersByTime(3300) })
  expect(screen.queryByRole('dialog', { name: 'ポコタンの案内' })).not.toBeInTheDocument() // 降りている途中は、時間では出さない（演出の長さとずれて間ができた）
  await act(async () => { introDoneCb?.() }) // 降り終わった
  expect(screen.getByRole('dialog', { name: 'ポコタンの案内' })).toBeInTheDocument() // その瞬間に出る（タイマーを進めなくてよい）
  await act(async () => { screen.getByRole('button', { name: 'スキップ' }).click() })
  expect(screen.queryByRole('dialog', { name: 'ポコタンの案内' })).not.toBeInTheDocument()
  expect(localStorage.getItem('mogumo.tutorial.u1')).toBe('1')
  expect(claimLoginBonus).toHaveBeenCalledTimes(1)
  await act(async () => { vi.advanceTimersByTime(500) })
  expect(screen.getByRole('dialog', { name: 'ログインボーナス' })).toBeInTheDocument() // 案内の後は待たずに出す
  claimLoginBonus.mockReset()
  vi.useRealTimers()
})

test('地図に入ってから降り終わるまで、画面全体（#root）はさわれない。初めての人は降り終わった瞬間に案内が出て、そこで外れる（2026-11-23 オーナー）', async () => {
  claimLoginBonus.mockReset()
  claimLoginBonus.mockResolvedValue({ stampNo: 1, coins: 10, claimedNow: false })
  const root = document.createElement('div')
  root.id = 'root'
  document.body.appendChild(root)
  render(
    <AuthContext.Provider value={{ session: { user: { id: 'lock-user' } } as never, loading: false, signInWithGoogle: vi.fn(), signInAsGuest: vi.fn(), linkGoogle: vi.fn(), signOut: vi.fn() }}>
      <MapPage />
    </AuthContext.Provider>,
    { container: root },
  )
  expect(root.inert).toBe(false) // タイトルの間（地図に入る前）はロックしない
  await act(async () => { loading.enter() })
  expect(root.inert).toBe(true) // 降りている間はさわれない
  expect(screen.queryByRole('dialog', { name: 'ポコタンの案内' })).not.toBeInTheDocument() // 見えない
  const standby = document.querySelector('.guide--standby')
  expect(standby).not.toBeNull() // 降りている間に、控え（見えない）で組み立ててある（ポコタンの絵の準備を先に済ませる）
  await act(async () => { introDoneCb?.() }) // 降り終わった
  const guide = screen.getByRole('dialog', { name: 'ポコタンの案内' })
  expect(guide).toBe(standby) // 作り直さず、同じものを見せるだけ（その場で読み込み・準備をしない）
  expect(guide.classList.contains('guide--standby')).toBe(false)
  expect(root.contains(guide)).toBe(false) // 案内は #root の外（さわれる）
  expect(root.inert).toBe(false) // 案内が出たのと同じ描き直しで外れる
  await act(async () => { screen.getByRole('button', { name: 'スキップ' }).click() })
  root.remove()
  claimLoginBonus.mockReset()
})

test('2 回目以降の人も、降りている間はさわれず、降り終わったらすぐさわれる（案内は出ない）', async () => {
  localStorage.setItem('mogumo.tutorial.seen-user', '1')
  const root = document.createElement('div')
  root.id = 'root'
  document.body.appendChild(root)
  render(
    <AuthContext.Provider value={{ session: { user: { id: 'seen-user' } } as never, loading: false, signInWithGoogle: vi.fn(), signInAsGuest: vi.fn(), linkGoogle: vi.fn(), signOut: vi.fn() }}>
      <MapPage />
    </AuthContext.Provider>,
    { container: root },
  )
  await act(async () => { loading.enter() })
  expect(root.inert).toBe(true)
  await act(async () => { introDoneCb?.() })
  expect(root.inert).toBe(false)
  expect(screen.queryByRole('dialog', { name: 'ポコタンの案内' })).not.toBeInTheDocument()
  root.remove()
})

test('新しいアカウント: タイトルを閉じたのがログイン・初回設定の前でも、地図に着いたらポコタンの案内が出る（出ていなかった。2026-11-17 オーナー）', async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  claimLoginBonus.mockReset()
  claimLoginBonus.mockResolvedValue({ stampNo: 1, coins: 10, claimedNow: true })
  act(() => loading.enter()) // ログインの画面でタイトルを閉じた（地図の画面はまだ無い）
  const before = introCalls.length
  render(
    <AuthContext.Provider value={{ session: { user: { id: 'new-user' } } as never, loading: false, signInWithGoogle: vi.fn(), signInAsGuest: vi.fn(), linkGoogle: vi.fn(), signOut: vi.fn() }}>
      <MapPage />
    </AuthContext.Provider>,
  )
  // 地図に来たところで降りる（前は降りる演出が抜けて、いきなりポコタンだった。2026-11-23 オーナー）。タイトルは出し直さない
  expect(introCalls.length).toBe(before + 1)
  expect(loading.hasEntered()).toBe(true)
  expect(screen.queryByRole('dialog', { name: 'ポコタンの案内' })).not.toBeInTheDocument() // 降りている間は出ない
  await act(async () => { introDoneCb?.() }) // 降り終わった瞬間に出る
  expect(screen.getByRole('dialog', { name: 'ポコタンの案内' })).toBeInTheDocument()
  claimLoginBonus.mockReset()
  vi.useRealTimers()
})

test('一度地図に入ったあと、規約などほかの画面から戻ってきたときは、降りる演出をしない（今までどおり）', async () => {
  localStorage.setItem('mogumo.tutorial.back-user', '1')
  act(() => {
    loading.enter()
    loading.markMapShown()
  })
  const before = introCalls.length
  render(
    <AuthContext.Provider value={{ session: { user: { id: 'back-user' } } as never, loading: false, signInWithGoogle: vi.fn(), signInAsGuest: vi.fn(), linkGoogle: vi.fn(), signOut: vi.fn() }}>
      <MapPage />
    </AuthContext.Provider>,
  )
  expect(introCalls.length).toBe(before)
})

test('降りる途中で地図が片付けられた（途中で終わった合図）ときは、さわれるようにせず、もう一度降りる', async () => {
  localStorage.setItem('mogumo.tutorial.abort-user', '1')
  const root = document.createElement('div')
  root.id = 'root'
  document.body.appendChild(root)
  render(
    <AuthContext.Provider value={{ session: { user: { id: 'abort-user' } } as never, loading: false, signInWithGoogle: vi.fn(), signInAsGuest: vi.fn(), linkGoogle: vi.fn(), signOut: vi.fn() }}>
      <MapPage />
    </AuthContext.Provider>,
    { container: root },
  )
  await act(async () => { loading.enter() })
  const before = introCalls.length
  const aborted = introDoneCb as unknown as (aborted?: boolean) => void
  await act(async () => { aborted(true) })
  expect(root.inert).toBe(true) // 途中で終わっただけなので、まださわれない
  await act(async () => { await new Promise((r) => requestAnimationFrame(() => r(null))) })
  expect(introCalls.length).toBe(before + 1) // もう一度降りる
  await act(async () => { introDoneCb?.() })
  expect(root.inert).toBe(false)
  root.remove()
})

test('ログインボーナスは受け取り済み（claimedNow が false）なら画面を出さない', async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  claimLoginBonus.mockReset()
  claimLoginBonus.mockResolvedValueOnce({ stampNo: 2, coins: 0, claimedNow: false })
  localStorage.setItem('mogumo.tutorial.u1', '1')
  render(
    <AuthContext.Provider value={{ session: { user: { id: 'u1' } } as never, loading: false, signInWithGoogle: vi.fn(), signInAsGuest: vi.fn(), linkGoogle: vi.fn(), signOut: vi.fn() }}>
      <MapPage />
    </AuthContext.Provider>,
  )
  await act(async () => { loading.enter() })
  await act(async () => { vi.advanceTimersByTime(5000) })
  expect(claimLoginBonus).toHaveBeenCalled()
  expect(screen.queryByRole('dialog', { name: 'ログインボーナス' })).not.toBeInTheDocument()
  vi.useRealTimers()
})

test('チェックインで霧が晴れたら、地図のお店のタイルを送る（時間では送らない）', async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
  syncOsmShops.mockClear()
  postCheckin.mockReset()
  postCheckin.mockResolvedValue({ ok: true, checkinId: 'c1', coins: 30, newCells: [{ x: 1, y: 2 }] })
  render(
    <AuthContext.Provider value={{ session: { user: { id: 'u1' } } as never, loading: false, signInWithGoogle: vi.fn(), signInAsGuest: vi.fn(), linkGoogle: vi.fn(), signOut: vi.fn() }}>
      <MapPage />
    </AuthContext.Provider>,
  )
  await act(async () => {}) // お店がそろったときの 1 回
  const afterReady = syncOsmShops.mock.calls.length
  act(() => { vi.advanceTimersByTime(5 * 60_000) })
  expect(syncOsmShops.mock.calls.length).toBe(afterReady)
  act(() => last().position(here))
  act(() => last().select(shop))
  await user.click(screen.getByRole('button', { name: 'チェックイン' }))
  expect(syncOsmShops.mock.calls.length).toBe(afterReady + 1)
})
