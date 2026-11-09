import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { AuthContext } from '../auth/AuthContext.ts'
import type { LatLng } from '../map/domain/geo.ts'
import type { LocationEvent } from '../map/domain/locationStatus.ts'
import type { Shop } from '../shops/domain/shop.ts'
import { MapPage } from './MapPage.tsx'

vi.mock('../checkin/ui/confetti.ts', () => ({ startConfetti: () => () => {} }))
vi.mock('../lib/supabase.ts', () => ({ supabase: {} }))
const mounts: ((e: LocationEvent) => void)[] = []
const shopErrors: (() => void)[] = []
const handlers: { select: (s: Shop | null) => void; building: (s: Shop[] | null) => void; position: (p: LatLng) => void }[] = []
const checkinCalls: { id: string; cells: unknown[] }[] = []
const unfocusCalls: number[] = []
const postCheckin = vi.fn()
vi.mock('../checkin/infra/checkinApi.ts', () => ({ postCheckin: (...a: unknown[]) => postCheckin(...a) }))
const readTodayHints = vi.fn()
const postDailyHints = vi.fn()
vi.mock('../hints/infra/hintsApi.ts', () => ({
  readTodayHints: (...a: unknown[]) => readTodayHints(...a),
  postDailyHints: (...a: unknown[]) => postDailyHints(...a),
}))
const hintTaps: ((id: string) => void)[] = []
const focusAtCalls: LatLng[] = []
let mapShopsNow: Shop[] = []
afterEach(() => vi.useRealTimers())
beforeEach(() => {
  localStorage.clear()
  readTodayHints.mockReset()
  readTodayHints.mockResolvedValue({ ok: true, set: null })
  postDailyHints.mockReset()
  mapShopsNow = []
  focusAtCalls.length = 0
})
vi.mock('../map/ui/MapView.tsx', async () => {
  const { useEffect, useImperativeHandle } = await import('react')
  return {
    MapView: ({ pinsHidden, onStatus, onShopsError, onSelectShop, onSelectBuilding, onPosition, onHintTap, ref }: {
      onStatus: (e: LocationEvent) => void; onShopsError: () => void
      onSelectShop: (s: Shop | null) => void; onSelectBuilding: (s: Shop[] | null) => void; onPosition: (p: LatLng) => void
      onHintTap: (id: string) => void; pinsHidden?: boolean
      ref?: React.Ref<{ checkin(shop: Shop, cells: unknown[]): void }>
    }) => {
      useEffect(() => { mounts.push(onStatus) }, [onStatus])
      useEffect(() => { shopErrors.push(onShopsError) }, [onShopsError])
      useEffect(() => { hintTaps.push(onHintTap) }, [onHintTap])
      useEffect(() => { handlers.push({ select: onSelectShop, building: onSelectBuilding, position: onPosition }) }, [onSelectShop, onSelectBuilding, onPosition])
      useImperativeHandle(ref, () => ({ checkin: (shop, cells) => { checkinCalls.push({ id: shop.id, cells }) }, unfocus: () => { unfocusCalls.push(1) }, isCheckedToday: () => false, checked: () => new Set<string>(),
        hintInputs: () => ({ shops: mapShopsNow, near: mapShopsNow, cleared: new Set<string>(), checked: new Set<string>() }),
        whenShopsReady: () => Promise.resolve(), setHints: () => {}, bounceHint: () => {}, focusAt: (p: LatLng) => { focusAtCalls.push(p) },
      }), [])
      return <div data-testid="map-view" data-pins-hidden={String(pinsHidden)} />
    },
  }
})

test('見つからない → もう一度試す で探索中に戻り、地図を作り直す', async () => {
  render(
    <AuthContext.Provider value={{ session: null, loading: false, signInWithGoogle: vi.fn(), signOut: vi.fn() }}>
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
    <AuthContext.Provider value={{ session: null, loading: false, signInWithGoogle: vi.fn(), signOut: vi.fn() }}>
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
    <AuthContext.Provider value={{ session: null, loading: false, signInWithGoogle: vi.fn(), signOut: vi.fn() }}>
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

test('ホットペッパーのクレジットがいつも出ていて、規約のリンク先を向く', () => {
  render(
    <AuthContext.Provider value={{ session: null, loading: false, signInWithGoogle: vi.fn(), signOut: vi.fn() }}>
      <MapPage />
    </AuthContext.Provider>,
  )
  expect(screen.getByRole('link', { name: 'Powered by ホットペッパーグルメ Webサービス' })).toHaveAttribute('href', 'http://webservice.recruit.co.jp/')
})

test('一覧で店を選ぶと、一覧が閉じてお店のシートが出る', async () => {
  render(
    <AuthContext.Provider value={{ session: null, loading: false, signInWithGoogle: vi.fn(), signOut: vi.fn() }}>
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

test('探索ボタンでシートが開き、店名が出ない', async () => {
  await withHints()
  await userEvent.click(screen.getByRole('button', { name: /探索/ }))
  expect(screen.getByRole('region', { name: '探索' })).toBeInTheDocument()
  expect(await screen.findByText('中華？')).toBeInTheDocument()
  expect(document.body.textContent).not.toContain('麺屋かくれ')
})

test('気配を押すと focusAt とヒントのシート。閉じると unfocus', async () => {
  await withHints()
  await userEvent.click(screen.getByRole('button', { name: /探索/ }))
  await userEvent.click(await screen.findByRole('button', { name: /中華？/ }))
  expect(focusAtCalls).toHaveLength(1)
  expect(screen.getByRole('region', { name: '気配' })).toBeInTheDocument()
  expect(screen.queryByRole('region', { name: '探索' })).toBeNull()
  expect(screen.getByText('？？？')).toBeInTheDocument()
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

test('ピンのボタンで出す・出さないが切りかわり、その端末に覚える', async () => {
  const view = () => render(
    <AuthContext.Provider value={{ session: null, loading: false, signInWithGoogle: vi.fn(), signOut: vi.fn() }}>
      <MapPage />
    </AuthContext.Provider>,
  )
  const first = view()
  expect(screen.getByTestId('map-view')).toHaveAttribute('data-pins-hidden', 'false')
  await userEvent.click(screen.getByRole('button', { name: 'ピンを隠す' }))
  expect(screen.getByTestId('map-view')).toHaveAttribute('data-pins-hidden', 'true')
  expect(localStorage.getItem('mogumo.pinsHidden')).toBe('1')
  first.unmount()
  view() // 開き直しても覚えている
  expect(screen.getByTestId('map-view')).toHaveAttribute('data-pins-hidden', 'true')
  await userEvent.click(screen.getByRole('button', { name: 'ピンを出す' }))
  expect(localStorage.getItem('mogumo.pinsHidden')).toBe('0')
})
