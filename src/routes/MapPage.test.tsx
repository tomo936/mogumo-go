import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'
import { AuthContext } from '../auth/AuthContext.ts'
import type { LatLng } from '../map/domain/geo.ts'
import type { LocationEvent } from '../map/domain/locationStatus.ts'
import type { Shop } from '../shops/domain/shop.ts'
import { MapPage } from './MapPage.tsx'

vi.mock('../lib/supabase.ts', () => ({ supabase: {} }))
const mounts: ((e: LocationEvent) => void)[] = []
const shopErrors: (() => void)[] = []
const handlers: { select: (s: Shop | null) => void; position: (p: LatLng) => void }[] = []
const checkinCalls: string[] = []
const postCheckin = vi.fn()
vi.mock('../checkin/infra/checkinApi.ts', () => ({ postCheckin: (...a: unknown[]) => postCheckin(...a) }))
vi.mock('../map/ui/MapView.tsx', async () => {
  const { useEffect, useImperativeHandle } = await import('react')
  return {
    MapView: ({ onStatus, onShopsError, onSelectShop, onPosition, ref }: {
      onStatus: (e: LocationEvent) => void; onShopsError: () => void
      onSelectShop: (s: Shop | null) => void; onPosition: (p: LatLng) => void
      ref?: React.Ref<{ checkin(id: string): void }>
    }) => {
      useEffect(() => { mounts.push(onStatus) }, [onStatus])
      useEffect(() => { shopErrors.push(onShopsError) }, [onShopsError])
      useEffect(() => { handlers.push({ select: onSelectShop, position: onPosition }) }, [onSelectShop, onPosition])
      useImperativeHandle(ref, () => ({ checkin: (id) => { checkinCalls.push(id) } }), [])
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

const shop: Shop = { id: 'hp:J1', name: '麺屋もぐも', lat: 35, lng: 139, kind: 'ramen', details: null }
const here: LatLng = { lat: 35, lng: 139 }
const renderPage = () =>
  render(
    <AuthContext.Provider value={{ session: null, loading: false, signInWithGoogle: vi.fn(), signOut: vi.fn() }}>
      <MapPage />
    </AuthContext.Provider>,
  )
const last = () => handlers[handlers.length - 1]

test('お店をタップするとシートが出て、チェックインが成功すると閉じる', async () => {
  postCheckin.mockResolvedValue({ ok: true, checkinId: 'c1', coins: 30, newCells: [] })
  renderPage()
  act(() => last().position(here))
  act(() => last().select(shop))
  expect(screen.getByText('麺屋もぐも')).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'チェックイン' }))
  expect(postCheckin).toHaveBeenCalledWith({ shopId: 'hp:J1', me: here, farFromHome: false })
  expect(screen.queryByText('麺屋もぐも')).not.toBeInTheDocument()
  expect(checkinCalls).toEqual(['hp:J1'])
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
