import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router'
import boy from '../../assets/characters/starter-boy.webp'
import girl from '../../assets/characters/starter-girl.webp'
import { Icon } from '../../ui/Icon.tsx'
import { loadDraft, saveDraft } from '../infra/draftStore.ts'
import type { StarterId } from '../infra/profileRepo.ts'
import './setup.css'

// 101＝男の子、102＝女の子（DB 詳細設計 D-09）
// mirrored: 2人が向かい合うように、女の子の絵は左右反転して並べる（本人の希望 2026-11-06）
const STARTERS: { id: StarterId; name: string; image: string; mirrored?: boolean }[] = [
  { id: 101, name: '男の子', image: boy },
  { id: 102, name: '女の子', image: girl, mirrored: true },
]
// 2026-11-17 見た目を整えた（自宅の設定と同じ手帳。台の上に立つ 2 人・選ぶと橙の枠と ✓）

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
    <main className="setup-page hs cs">
      <header className="hs__bar">
        <button type="button" className="hs__back" aria-label="戻る" onClick={() => navigate('/setup/name')}>
          <Icon name="back" size={20} />
        </button>
        <span className="hs__step">2 / 3</span>
      </header>
      <h1>最初のなかまを選ぼう</h1>
      <p className="hs__lead">いっしょに町を歩くなかまだよ</p>
      <div className="cs__cards">
        {STARTERS.map((s) => (
          <button
            key={s.id}
            type="button"
            className="cs__card"
            aria-pressed={picked === s.id}
            onClick={() => setPicked(s.id)}
          >
            <span className="cs__stage">
              <img src={s.image} alt="" className={s.mirrored ? 'is-mirrored' : undefined} />
            </span>
            <span className="cs__name">{s.name}</span>
            {picked === s.id && (
              <span className="cs__check" aria-hidden="true">
                ✓
              </span>
            )}
          </button>
        ))}
      </div>
      <ul className="hs__notes">
        <li>
          <Icon name="star" size={18} />
          <span>ガチャで出会ったなかまとも、あとから入れかえられるよ</span>
        </li>
      </ul>
      <button type="button" className="hs__ok" onClick={submit} disabled={!picked}>
        次へ
      </button>
    </main>
  )
}
