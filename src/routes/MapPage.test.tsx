import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'
import { AuthContext } from '../auth/AuthContext.ts'
import type { LocationEvent } from '../map/domain/locationStatus.ts'
import { MapPage } from './MapPage.tsx'

vi.mock('../lib/supabase.ts', () => ({ supabase: {} }))
const mounts: ((e: LocationEvent) => void)[] = []
const shopErrors: (() => void)[] = []
vi.mock('../map/ui/MapView.tsx', async () => {
  const { useEffect } = await import('react')
  return {
    MapView: ({ onStatus, onShopsError }: { onStatus: (e: LocationEvent) => void; onShopsError: () => void }) => {
      useEffect(() => { mounts.push(onStatus) }, [onStatus])
      useEffect(() => { shopErrors.push(onShopsError) }, [onShopsError])
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
