import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase.ts'
import { AuthContext } from './AuthContext.ts'

async function signInWithGoogle() {
  await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.origin },
  })
}

async function signInAsGuest(captchaToken: string | null): Promise<true | string> {
  try {
    const { error } = await supabase.auth.signInAnonymously(captchaToken ? { options: { captchaToken } } : undefined)
    return error ? `${error.status ?? ''} ${error.code ?? error.message}`.trim() : true
  } catch (e) {
    return e instanceof Error ? e.message : 'error'
  }
}

// 戻ってきたら同じアカウントのまま本登録。その Google がほかのアカウントで使われていたら、
// 戻り先の URL に error_code=identity_already_exists が付く（MapPage が拾う）
async function linkGoogle(): Promise<boolean> {
  try {
    const { error } = await supabase.auth.linkIdentity({ provider: 'google', options: { redirectTo: window.location.origin } })
    return !error
  } catch {
    return false
  }
}

async function signOut() {
  await supabase.auth.signOut()
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return
      setSession(data.session)
      setLoading(false)
    })
    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next)
      setLoading(false)
    })
    return () => {
      active = false
      data.subscription.unsubscribe()
    }
  }, [])

  return (
    <AuthContext.Provider value={{ session, loading, signInWithGoogle, signInAsGuest, linkGoogle, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}
