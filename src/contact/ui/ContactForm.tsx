// お問い合わせ・不具合の報告（アプリ内のフォーム）。送るとサーバーの表 inquiries に届く。
// 設計: docs/superpowers/specs/2026-11-17-settings-legal-contact-design.md
import { useState } from 'react'
import './contact.css'
import { SubPage } from '../../settings/ui/SubPage.tsx'
import { BODY_MAX, INQUIRY_KINDS, bodyOk } from '../domain/inquiry.ts'
import type { InquiryKind, SendResult } from '../domain/inquiry.ts'

type Props = {
  email: string | null // 返事の宛先（見せるだけ。実際の宛先はサーバーが付ける）
  guest?: boolean // ゲストはメールが無いので返事を送れない
  send: (kind: InquiryKind, body: string) => Promise<SendResult>
  onClose: () => void
}

const ERROR: Record<Exclude<SendResult, 'ok'>, string> = {
  too_many: '送れる数（1 日 5 件）をこえました。時間をおいてから送ってください。',
  bad: '内容を確かめて、もう一度送ってください。',
  failed: '送れませんでした。通信のよい所でもう一度送ってください。',
}

export function ContactForm({ email, guest, send, onClose }: Props) {
  const [kind, setKind] = useState<InquiryKind>('bug')
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<SendResult | null>(null)
  const length = [...body.trim()].length

  const submit = async () => {
    if (busy || !bodyOk(body)) return
    setBusy(true)
    setResult(await send(kind, body))
    setBusy(false)
  }

  return (
    <SubPage title="お問い合わせ" onBack={onClose}>
      {result === 'ok' ? (
        <div className="ct__done" role="status">
          <b>届きました。ありがとうございます！</b>
          <p>返事が必要なものは、ログインのメールアドレスにお送りします。数日かかることがあります。</p>
          <button type="button" className="ct__send" onClick={onClose}>
            設定に戻る
          </button>
        </div>
      ) : (
        <form
          className="ct"
          onSubmit={(e) => {
            e.preventDefault()
            void submit()
          }}
        >
          <fieldset className="ct__kinds">
            <legend>種類</legend>
            {INQUIRY_KINDS.map((k) => (
              <label key={k.id} className={kind === k.id ? 'ct__kind is-on' : 'ct__kind'}>
                <input type="radio" name="kind" value={k.id} checked={kind === k.id} onChange={() => setKind(k.id)} />
                {k.label}
              </label>
            ))}
          </fieldset>
          <label className="ct__label" htmlFor="ct-body">
            内容
          </label>
          <textarea
            id="ct-body"
            className="ct__body"
            value={body}
            maxLength={BODY_MAX + 200}
            rows={8}
            placeholder={kind === 'bug' ? 'どの画面で、何をしたら、どうなったかを教えてください' : 'ご自由にお書きください'}
            onChange={(e) => setBody(e.target.value)}
          />
          <div className={length > BODY_MAX ? 'ct__count is-over' : 'ct__count'}>{`${length} / ${BODY_MAX}`}</div>
          <p className="ct__note">
            {guest ? 'ゲストには返事を送れません。返事が要るときは、設定から Google をつないでから送ってください。' : `返事の宛先: ${email ?? 'ログインのメールアドレス'}`}
            <br />
            アプリの版と端末の種類もいっしょに送ります（不具合を調べるため）。
          </p>
          {result && (
            <p className="ct__err" role="alert">
              {ERROR[result]}
            </p>
          )}
          <button type="submit" className="ct__send" disabled={busy || !bodyOk(body)}>
            {busy ? '送っています…' : '送る'}
          </button>
        </form>
      )}
    </SubPage>
  )
}
