import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { useAuth } from '../../auth/AuthContext.ts'
import { loadHome } from '../infra/homeStore.ts'
import { profileRepo } from '../infra/profileRepo.ts'
import type { ProfileRepo } from '../infra/profileRepo.ts'
import { SetupStatusContext } from './SetupStatusContext.ts'

type Loaded = { loading: boolean; error: boolean; hasProfile: boolean; hasHome: boolean }

// 「サーバーに profiles があるか」と「この端末にこのアカウントの自宅があるか」をログイン後に1回読む
export function SetupStatusProvider({ children, repo = profileRepo }: { children: ReactNode; repo?: ProfileRepo }) {
  const { session } = useAuth()
  const userId = session?.user.id ?? ''
  const [state, setState] = useState<Loaded>({ loading: true, error: false, hasProfile: false, hasHome: false })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let active = true
    repo.exists(userId).then(
      (hasProfile) => {
        if (active) setState({ loading: false, error: false, hasProfile, hasHome: loadHome(userId) !== null })
      },
      () => {
        if (active) setState((s) => ({ ...s, loading: false, error: true }))
      },
    )
    return () => {
      active = false
    }
  }, [userId, repo, attempt])

  const markProfileCreated = useCallback(() => setState((s) => ({ ...s, hasProfile: true })), [])
  const markHomeSaved = useCallback(() => setState((s) => ({ ...s, hasHome: true })), [])
  const retry = useCallback(() => {
    setState((s) => ({ ...s, loading: true, error: false }))
    setAttempt((n) => n + 1)
  }, [])
  const value = useMemo(
    () => ({ ...state, markProfileCreated, markHomeSaved, retry }),
    [state, markProfileCreated, markHomeSaved, retry],
  )

  return <SetupStatusContext.Provider value={value}>{children}</SetupStatusContext.Provider>
}
