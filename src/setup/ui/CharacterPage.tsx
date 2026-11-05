import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router'
import boy from '../../assets/characters/starter-boy.webp'
import girl from '../../assets/characters/starter-girl.webp'
import { loadDraft, saveDraft } from '../infra/draftStore.ts'
import type { StarterId } from '../infra/profileRepo.ts'
import './setup.css'

// 101＝男の子、102＝女の子（DB 詳細設計 D-09）
const STARTERS: { id: StarterId; name: string; image: string }[] = [
  { id: 101, name: '男の子', image: boy },
  { id: 102, name: '女の子', image: girl },
]

export function CharacterPage() {
  const navigate = useNavigate()
  const [draft] = useState(loadDraft)
  const [picked, setPicked] = useState<StarterId | undefined>(draft.starterId)
  if (!draft.nickname) return <Navigate to="/setup/name" replace />

  const submit = () => {
    if (!picked) return
    saveDraft({ starterId: picked })
    navigate('/setup/home')
  }

  return (
    <main className="setup-page">
      <button type="button" className="setup-back" onClick={() => navigate('/setup/name')}>戻る</button>
      <h1>最初のなかまを選ぼう</h1>
      <div className="setup-cards">
        {STARTERS.map((s) => (
          <button
            key={s.id}
            type="button"
            className="setup-card"
            aria-pressed={picked === s.id}
            onClick={() => setPicked(s.id)}
          >
            <img src={s.image} alt="" />
            <span>{s.name}</span>
          </button>
        ))}
      </div>
      <div className="setup-actions">
        <button type="button" onClick={submit} disabled={!picked}>次へ</button>
      </div>
    </main>
  )
}
