import { useAuth } from '../auth/AuthContext.ts'

export function MapPage() {
  const { signOut } = useAuth()
  return (
    <main className="page">
      <h1>地図（準備中）</h1>
      <button type="button" onClick={() => void signOut()}>
        ログアウト
      </button>
    </main>
  )
}
