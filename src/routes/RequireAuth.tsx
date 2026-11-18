import { Navigate, Outlet } from 'react-router'
import { useAuth } from '../auth/AuthContext.ts'
import { LoadingStatus } from '../credits/LoadingStatus.tsx'

export function RequireAuth() {
  const { session, loading } = useAuth()
  if (loading) return <LoadingStatus />
  if (!session) return <Navigate to="/login" replace />
  return <Outlet />
}
