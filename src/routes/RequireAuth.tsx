import { Navigate, Outlet } from 'react-router'
import { useAuth } from '../auth/AuthContext.ts'

export function RequireAuth() {
  const { session, loading } = useAuth()
  if (loading) return <p className="status">読み込み中…</p>
  if (!session) return <Navigate to="/login" replace />
  return <Outlet />
}
