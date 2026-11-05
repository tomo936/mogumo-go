import { Navigate } from 'react-router'
import { useAuth } from '../auth/AuthContext.ts'

export function LoginPage() {
  const { session, loading, signInWithGoogle } = useAuth()
  if (loading) return <p className="status">読み込み中…</p>
  if (session) return <Navigate to="/" replace />
  return (
    <main className="page">
      <h1>もぐもGO</h1>
      <button type="button" onClick={() => void signInWithGoogle()}>
        Google でログイン
      </button>
    </main>
  )
}
