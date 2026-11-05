import { useState } from 'react'
import { useNavigate } from 'react-router'
import { checkNickname, remainingChars } from '../domain/nickname.ts'
import { loadDraft, saveDraft } from '../infra/draftStore.ts'
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
    <main className="setup-page">
      <h1>ニックネームを決めよう</h1>
      <p className="setup-note">10文字まで。ほかの人と同じでも大丈夫です。あとから変えられます</p>
      <label className="setup-field">
        <span>ニックネーム</span>
        <input id="nickname" value={raw} onChange={(e) => setRaw(e.target.value)} autoComplete="nickname" />
      </label>
      {raw !== '' && !check.ok ? (
        <p className="setup-error" role="alert">{ERRORS[check.reason]}</p>
      ) : (
        <p className="setup-note">あと{remainingChars(raw)}文字</p>
      )}
      <div className="setup-actions">
        <button type="button" onClick={submit} disabled={!check.ok}>次へ</button>
      </div>
    </main>
  )
}
