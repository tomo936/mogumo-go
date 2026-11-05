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

test('ログイン済みで / を開くと地図とログアウト', () => {
  renderAt('/', { session })
  expect(screen.getByTestId('map-view')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'ログアウト' })).toBeInTheDocument()
})

test('ログイン済みで /setup を開くと仮の初回設定', () => {
  renderAt('/setup', { session })
  expect(screen.getByText('初回設定（準備中）')).toBeInTheDocument()
})

test('ログイン済みで /login を開くと地図へ戻る', () => {
  renderAt('/login', { session })
  expect(screen.getByTestId('map-view')).toBeInTheDocument()
})

test('ログインボタンで signInWithGoogle が呼ばれる', async () => {
  const auth = renderAt('/login', {})
  await userEvent.click(loginButton()!)
  expect(auth.signInWithGoogle).toHaveBeenCalledTimes(1)
})

test('ログアウトボタンで signOut が呼ばれる', async () => {
  const auth = renderAt('/', { session })
  await userEvent.click(screen.getByRole('button', { name: 'ログアウト' }))
  expect(auth.signOut).toHaveBeenCalledTimes(1)
})
