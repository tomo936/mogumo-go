import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Session } from '@supabase/supabase-js'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { beforeEach, expect, test, vi } from 'vitest'
import { AuthContext } from '../../auth/AuthContext.ts'
import { routes } from '../../routes/router.tsx'

const repo = vi.hoisted(() => ({ exists: vi.fn(), load: vi.fn().mockResolvedValue(null), create: vi.fn() }))
const home = vi.hoisted(() => ({ value: null as { lat: number; lng: number } | null }))
vi.mock('../../lib/supabase.ts', () => ({ supabase: {} }))
vi.mock('../infra/profileRepo.ts', () => ({ profileRepo: repo }))
vi.mock('../infra/homeStore.ts', () => ({ loadHome: () => home.value, saveHome: vi.fn() }))
vi.mock('../../map/ui/MapView.tsx', () => ({ MapView: () => <div data-testid="map-view" /> }))
vi.mock('./HomePickerMap.tsx', () => ({ HomePickerMap: () => <div data-testid="home-picker" /> }))

const session = { user: { id: 'u1' } } as unknown as Session

function renderAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] })
  render(
    <AuthContext.Provider value={{ session, loading: false, signInWithGoogle: vi.fn(), signOut: vi.fn() }}>
      <RouterProvider router={router} />
    </AuthContext.Provider>,
  )
  return router
}

beforeEach(() => {
  repo.exists.mockReset()
  home.value = null
})

test('プロフィールが無ければ地図ではなくニックネームの画面', async () => {
  repo.exists.mockResolvedValue(false)
  renderAt('/')
  expect(await screen.findByText('ニックネームを決めよう')).toBeInTheDocument()
})

test('プロフィールはあるが自宅が無ければ自宅の画面', async () => {
  repo.exists.mockResolvedValue(true)
  renderAt('/')
  expect(await screen.findByText('自宅の場所を決めよう')).toBeInTheDocument()
})

test('両方そろっていれば地図', async () => {
  repo.exists.mockResolvedValue(true)
  home.value = { lat: 35, lng: 139 }
  renderAt('/')
  expect(await screen.findByTestId('map-view')).toBeInTheDocument()
})

test('初回設定が済んだ人が /setup/name を開くと地図へ', async () => {
  repo.exists.mockResolvedValue(true)
  home.value = { lat: 35, lng: 139 }
  renderAt('/setup/name')
  expect(await screen.findByTestId('map-view')).toBeInTheDocument()
})

test('プロフィールがあって自宅が無い人が /setup/name を開くと自宅の画面へ', async () => {
  repo.exists.mockResolvedValue(true)
  renderAt('/setup/name')
  expect(await screen.findByText('自宅の場所を決めよう')).toBeInTheDocument()
})

test('読み込み中は「読み込み中…」', async () => {
  repo.exists.mockReturnValueOnce(new Promise(() => {}))
  renderAt('/')
  expect(screen.getByText('読み込み中…')).toBeInTheDocument()
})

test('読み込みに失敗したら「もう一度試す」で読み直す', async () => {
  repo.exists.mockRejectedValueOnce(new Error('x')).mockResolvedValueOnce(true)
  home.value = { lat: 35, lng: 139 }
  renderAt('/')
  expect(await screen.findByText('読み込めませんでした')).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'もう一度試す' }))
  expect(await screen.findByTestId('map-view')).toBeInTheDocument()
})
