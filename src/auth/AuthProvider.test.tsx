import { act, render, screen } from '@testing-library/react'
import type { Session } from '@supabase/supabase-js'
import { beforeEach, expect, test, vi } from 'vitest'
import { AuthProvider } from './AuthProvider.tsx'
import { useAuth } from './AuthContext.ts'

const auth = vi.hoisted(() => ({
  getSession: vi.fn(),
  onAuthStateChange: vi.fn(),
  signInWithOAuth: vi.fn(),
  signOut: vi.fn(),
}))
vi.mock('../lib/supabase.ts', () => ({ supabase: { auth } }))

const unsubscribe = vi.fn()
let authCallback: (event: string, session: Session | null) => void = () => {}
let resolveSession: (session: Session | null) => void = () => {}

const fakeSession = (id: string) => ({ user: { id } }) as unknown as Session

function Probe() {
  const { session, loading, signInWithGoogle } = useAuth()
  return (
    <div>
      <p>{loading ? 'loading' : 'ready'}</p>
      <p>{session ? `user:${session.user.id}` : 'no-user'}</p>
      <button onClick={() => void signInWithGoogle()}>login</button>
    </div>
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  auth.getSession.mockReturnValue(
    new Promise((resolve) => {
      resolveSession = (session) => resolve({ data: { session }, error: null })
    }),
  )
  auth.onAuthStateChange.mockImplementation((cb) => {
    authCallback = cb
    return { data: { subscription: { unsubscribe } } }
  })
  auth.signInWithOAuth.mockResolvedValue({ data: {}, error: null })
})

test('getSession が返るまでは読み込み中、返ったらその session', async () => {
  render(<AuthProvider><Probe /></AuthProvider>)
  expect(screen.getByText('loading')).toBeInTheDocument()
  await act(async () => resolveSession(fakeSession('u1')))
  expect(screen.getByText('ready')).toBeInTheDocument()
  expect(screen.getByText('user:u1')).toBeInTheDocument()
})

test('ログイン状態が変わると session が更新される', async () => {
  render(<AuthProvider><Probe /></AuthProvider>)
  await act(async () => resolveSession(null))
  expect(screen.getByText('no-user')).toBeInTheDocument()
  act(() => authCallback('SIGNED_IN', fakeSession('u2')))
  expect(screen.getByText('user:u2')).toBeInTheDocument()
})

test('アンマウントで購読を解除する', async () => {
  const { unmount } = render(<AuthProvider><Probe /></AuthProvider>)
  await act(async () => resolveSession(null))
  unmount()
  expect(unsubscribe).toHaveBeenCalled()
})

test('Google ログインは今開いている URL に戻す', async () => {
  render(<AuthProvider><Probe /></AuthProvider>)
  await act(async () => resolveSession(null))
  await act(async () => screen.getByText('login').click())
  expect(auth.signInWithOAuth).toHaveBeenCalledWith({
    provider: 'google',
    options: { redirectTo: window.location.origin },
  })
})

test('Provider の外で useAuth を呼ぶとエラー', () => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  expect(() => render(<Probe />)).toThrow('useAuth must be used inside AuthProvider')
})
