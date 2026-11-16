// /privacy・/terms の道（ログインしていなくても読める）。戻るは前の画面へ、無ければログイン画面へ
import { useNavigate } from 'react-router'
import { LegalScreen } from './LegalScreen.tsx'
import type { LegalKind } from './LegalScreen.tsx'

export function LegalPage({ kind }: { kind: LegalKind }) {
  const navigate = useNavigate()
  const back = () => (window.history.length > 1 ? navigate(-1) : navigate('/login', { replace: true }))
  return <LegalScreen kind={kind} onClose={() => void back()} />
}
