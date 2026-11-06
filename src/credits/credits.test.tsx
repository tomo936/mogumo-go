import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { Splash } from './Splash.tsx'
import { CreditsButton } from './CreditsButton.tsx'

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

test('起動時のスプラッシュに地図の出典が出て、3秒で消える', () => {
  render(<Splash />)
  expect(screen.getByText('もぐもGO')).toBeInTheDocument()
  expect(screen.getByText('地図: OpenFreeMap © OpenMapTiles')).toBeInTheDocument()
  expect(screen.getByText('データ: © OpenStreetMap contributors')).toBeInTheDocument()
  expect(screen.getByText('Powered by ホットペッパーグルメ Webサービス')).toBeInTheDocument()
  act(() => vi.advanceTimersByTime(2999))
  expect(screen.queryByText('もぐもGO')).toBeInTheDocument()
  act(() => vi.advanceTimersByTime(1))
  expect(screen.queryByText('もぐもGO')).not.toBeInTheDocument()
})

test('スプラッシュはタップで消せる', () => {
  render(<Splash />)
  act(() => screen.getByRole('button', { name: /もぐもGO/ }).click())
  expect(screen.queryByText('もぐもGO')).not.toBeInTheDocument()
})

test('出典ボタンで詳しい出典とリンクが見られる', () => {
  render(<CreditsButton />)
  act(() => screen.getByRole('button', { name: '出典' }).click())
  expect(screen.getByRole('link', { name: 'OpenFreeMap' })).toHaveAttribute('href', 'https://openfreemap.org/')
  expect(screen.getByRole('link', { name: 'OpenMapTiles' })).toHaveAttribute('href', 'https://www.openmaptiles.org/')
  expect(screen.getByRole('link', { name: 'OpenStreetMap contributors' })).toHaveAttribute('href', 'https://www.openstreetmap.org/copyright')
  act(() => screen.getByRole('button', { name: '閉じる' }).click())
  expect(screen.queryByRole('link', { name: 'OpenFreeMap' })).not.toBeInTheDocument()
})
