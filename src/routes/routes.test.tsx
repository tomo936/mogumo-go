import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Session } from '@supabase/supabase-js'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { expect, test, vi } from 'vitest'
import { AuthContext } from '../auth/AuthContext.ts'
import type { AuthState } from '../auth/AuthContext.ts'
import { routes } from './router.tsx'

vi.mock('../lib/supabase.ts', () => ({ supabase: {} }))
// 地図（WebGL）はテスト環境で描けないので、器だけの偽物にする
// 初回設定は済んでいる人として扱う
vi.mock('../setup/infra/profileRepo.ts', () => ({ profileRepo: { exists: async () => true, create: async () => {} } }))
vi.mock('../setup/infra/homeStore.ts', () => ({ loadHome: () => ({ lat: 35, lng: 139 }), saveHome: () => {} }))
vi.mock('../map/ui/MapView.tsx', () => ({ MapView: () => <div data-testid="map-view" /> }))

const session = { user: { id: 'u1' } } as unknown as Session

function renderAt(path: string, auth: Partial<AuthState>) {
  const value: AuthState = {
    session: null,
    loading: false,
    signInWithGoogle: vi.fn(async () => {}),
    signOut: vi.fn(async () => {}),
    ...auth,
  }
  const router = createMemoryRouter(routes, { initialEntries: [path] })
  render(
    <AuthContext.Provider value={value}>
      <RouterProvider router={router} />
    </AuthContext.Provider>,
  )
  return value
}

const loginButton = () => screen.queryByRole('button', { name: 'Google でログイン' })

test('未ログインで / を開くとログイン画面', () => {
  renderAt('/', {})
  expect(loginButton()).toBeInTheDocument()
})

test('未ログインで /setup を開くとログイン画面', () => {
  renderAt('/setup', {})
  expect(loginButton()).toBeInTheDocument()
})

test('読み込み中はログイン画面へ飛ばさない', () => {
  renderAt('/', { loading: true })
  expect(screen.getByText('読み込み中…')).toBeInTheDocument()
  expect(loginButton()).not.toBeInTheDocument()
})

test('ログイン済みで / を開くと地図とログアウト', async () => {
  renderAt('/', { session })
  expect(await screen.findByTestId('map-view')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'ログアウト' })).toBeInTheDocument()
})

test('初回設定が済んだ人が /setup を開くと地図へ戻る', async () => {
  renderAt('/setup', { session })
  expect(await screen.findByTestId('map-view')).toBeInTheDocument()
})

test('ログイン済みで /login を開くと地図へ戻る', async () => {
  renderAt('/login', { session })
  expect(await screen.findByTestId('map-view')).toBeInTheDocument()
})

test('ログインボタンで signInWithGoogle が呼ばれる', async () => {
  const auth = renderAt('/login', {})
  await userEvent.click(loginButton()!)
  expect(auth.signInWithGoogle).toHaveBeenCalledTimes(1)
})

test('ログアウトボタンで signOut が呼ばれる', async () => {
  const auth = renderAt('/', { session })
  await userEvent.click(await screen.findByRole('button', { name: 'ログアウト' }))
  expect(auth.signOut).toHaveBeenCalledTimes(1)
})
