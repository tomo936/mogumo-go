import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'
import { AuthContext } from '../auth/AuthContext.ts'
import type { LatLng } from '../map/domain/geo.ts'
import type { LocationEvent } from '../map/domain/locationStatus.ts'
import type { Shop } from '../shops/domain/shop.ts'
import { MapPage } from './MapPage.tsx'

vi.mock('../checkin/ui/confetti.ts', () => ({ startConfetti: () => () => {} }))
vi.mock('../lib/supabase.ts', () => ({ supabase: {} }))
const mounts: ((e: LocationEvent) => void)[] = []
const shopErrors: (() => void)[] = []
const handlers: { select: (s: Shop | null) => void; position: (p: LatLng) => void }[] = []
const checkinCalls: { id: string; cells: unknown[] }[] = []
const unfocusCalls: number[] = []
const postCheckin = vi.fn()
vi.mock('../checkin/infra/checkinApi.ts', () => ({ postCheckin: (...a: unknown[]) => postCheckin(...a) }))
vi.mock('../map/ui/MapView.tsx', async () => {
  const { useEffect, useImperativeHandle } = await import('react')
  return {
    MapView: ({ onStatus, onShopsError, onSelectShop, onPosition, ref }: {
      onStatus: (e: LocationEvent) => void; onShopsError: () => void
      onSelectShop: (s: Shop | null) => void; onPosition: (p: LatLng) => void
      ref?: React.Ref<{ checkin(shop: Shop, cells: unknown[]): void }>
    }) => {
      useEffect(() => { mounts.push(onStatus) }, [onStatus])
      useEffect(() => { shopErrors.push(onShopsError) }, [onShopsError])
      useEffect(() => { handlers.push({ select: onSelectShop, position: onPosition }) }, [onSelectShop, onPosition])
      useImperativeHandle(ref, () => ({ checkin: (shop, cells) => { checkinCalls.push({ id: shop.id, cells }) }, unfocus: () => { unfocusCalls.push(1) }, isCheckedToday: () => false }), [])
      return <div data-testid="map-view" />
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
