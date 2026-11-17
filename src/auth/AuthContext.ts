import { createContext, useContext } from 'react'
import type { Session } from '@supabase/supabase-js'

export type AuthState = {
  session: Session | null
  loading: boolean
  signInWithGoogle: () => Promise<void>
  signInAsGuest: (captchaToken: string | null) => Promise<boolean> // ゲストで始める（A3）。入れたら true
  linkGoogle: () => Promise<boolean> // ゲストに Google をつなぐ（Google の画面へ移る）。移れなければ false
  signOut: () => Promise<void>
}

// ゲスト（Supabase の匿名ログイン）か。設計 docs/superpowers/specs/2026-11-17-guest-login-design.md
export function isGuest(session: Session | null): boolean {
  return session?.user.is_anonymous === true
}

export const AuthContext = createContext<AuthState | null>(null)

export function useAuth(): AuthState {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth must be used inside AuthProvider')
  return value
}
