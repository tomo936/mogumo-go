import { Navigate, Outlet, useLocation } from 'react-router'
import { nextSetupPath } from '../domain/gate.ts'
import { SetupStatusProvider } from './SetupStatus.tsx'
import { useSetupStatus } from './SetupStatusContext.ts'

export function SetupStatusLayout() {
  return (
    <SetupStatusProvider>
      <Outlet />
    </SetupStatusProvider>
  )
}

function Waiting() {
  const { loading, retry } = useSetupStatus()
  if (loading) return <p className="status">読み込み中…</p>
  return (
    <main className="page">
      <p>読み込めませんでした</p>
      <button type="button" onClick={retry}>もう一度試す</button>
    </main>
  )
}

// 地図など、初回設定が済んでから入る画面の前に置く
export function RequireSetupDone() {
  const s = useSetupStatus()
  if (s.loading || s.error) return <Waiting />
  const next = nextSetupPath(s)
  return next ? <Navigate to={next} replace /> : <Outlet />
}

// 初回設定の画面の前に置く。済んでいれば地図へ、自宅だけ足りなければ自宅の画面へ
export function RedirectIfSetupDone() {
  const s = useSetupStatus()
  const { pathname } = useLocation()
  if (s.loading || s.error) return <Waiting />
  const next = nextSetupPath(s)
  if (next === null) return <Navigate to="/" replace />
  if (next === '/setup/home' && pathname !== '/setup/home') return <Navigate to="/setup/home" replace />
  return <Outlet />
}
