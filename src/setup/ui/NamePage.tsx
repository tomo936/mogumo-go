import { useState } from 'react'
import { useNavigate } from 'react-router'
import { checkNickname, remainingChars } from '../domain/nickname.ts'
import { loadDraft, saveDraft } from '../infra/draftStore.ts'
import { Icon } from '../../ui/Icon.tsx'
import './setup.css'

const ERRORS = { empty: 'ニックネームを入れてください', tooLong: '10文字までにしてください' } as const

export function NamePage() {
  const navigate = useNavigate()
  const [raw, setRaw] = useState(() => loadDraft().nickname ?? '')
  const check = checkNickname(raw)

  const submit = () => {
    if (!check.ok) return
    saveDraft({ nickname: check.value })
    navigate('/setup/character')
  }

  return (
    <main className="setup-page hs nm">
      <header className="hs__bar">
        <span className="hs__step">1 / 3</span>
      </header>
      <h1>ニックネームを決めよう</h1>
      <p className="hs__lead">みんなに見える名前だよ</p>
      <div className="nm__card">
        <label className="nm__label" htmlFor="nickname">ニックネーム</label>
        <input id="nickname" className="nm__input" value={raw} onChange={(e) => setRaw(e.target.value)} autoComplete="nickname" placeholder="例: もぐもぐ" />
        {raw !== '' && !check.ok ? (
          <span className="setup-error nm__hint" role="alert">{ERRORS[check.reason]}</span>
        ) : (
          <span className="nm__hint">あと{remainingChars(raw)}文字</span>
        )}
      </div>
      <ul className="hs__notes">
        <li>
          <Icon name="pencil" size={18} />
          <span>10文字まで。ほかの人と同じでも大丈夫。あとからマイページで変えられます</span>
        </li>
      </ul>
      <button type="button" className="hs__ok nm__next" onClick={submit} disabled={!check.ok}>
        次へ
      </button>
    </main>
  )
}
