// 退会（データを消してやめる）。消えるものを見せてから、2 回確かめて消す。
// 設計: docs/superpowers/specs/2026-11-17-settings-legal-contact-design.md
import { useState } from 'react'
import './account.css'
import { SubPage } from '../../settings/ui/SubPage.tsx'

type Props = {
  remove: () => Promise<boolean> // 消す（サーバーと端末）。消せたら true
  onDeleted: () => void // 消えたあと（ログアウトしてログイン画面へ）
  onClose: () => void
}

export function DeleteAccount({ remove, onDeleted, onClose }: Props) {
  const [step, setStep] = useState<'explain' | 'confirm'>('explain')
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)

  const run = async () => {
    if (busy) return
    setBusy(true)
    setFailed(false)
    if (await remove()) return onDeleted()
    setBusy(false)
    setFailed(true)
  }

  return (
    <SubPage title="データを消してやめる" onBack={onClose}>
      <div className="ac">
        <p>退会すると、次のものが<b>すべて消え、元に戻せません</b>。</p>
        <ul>
          <li>アカウント（ニックネーム・キャラクター）</li>
          <li>チェックインの記録・図鑑・晴れた霧・町のクリア</li>
          <li>グルメコイン・レベル・実績・ミッション</li>
          <li>書いた感想と写真</li>
          <li>この端末に保存した自宅の場所など</li>
        </ul>
        <p className="ac__small">お問い合わせの内容は、対応のため 1 年まで残ります。同じ Google アカウントでもう一度始めると、最初からになります。</p>

        {failed && (
          <p className="ac__err" role="alert">
            消せませんでした。通信のよい所でもう一度お試しください。
          </p>
        )}

        {step === 'explain' ? (
          <>
            <button type="button" className="ac__danger" onClick={() => setStep('confirm')}>
              消してやめる
            </button>
            <button type="button" className="ac__cancel" onClick={onClose}>
              やめない
            </button>
          </>
        ) : (
          <div className="ac__confirm" role="alertdialog" aria-label="本当に消しますか">
            <b>本当に消しますか？</b>
            <button type="button" className="ac__danger" disabled={busy} onClick={() => void run()}>
              {busy ? '消しています…' : 'すべて消す'}
            </button>
            <button type="button" className="ac__cancel" disabled={busy} onClick={() => setStep('explain')}>
              やっぱりやめる
            </button>
          </div>
        )}
      </div>
    </SubPage>
  )
}
