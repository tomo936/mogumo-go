// お知らせ・プレゼント（A7、全画面）。上のタブで切り替え。右から滑って出る手帳風（近くのお店の一覧と同じ見た目）。
// 設計: docs/superpowers/specs/2026-11-17-inbox-design.md
import { useEffect, useRef, useState } from 'react'
import './inbox.css'
import { expiryText, firstTab } from '../domain/inbox.ts'
import type { ClaimResult, InboxTab, Notice, Present } from '../domain/inbox.ts'
import { Icon } from '../../ui/Icon.tsx'
import { CoinIcon } from '../../ui/CoinIcon.tsx'
import { sound } from '../../sound/infra/sound.ts'

type Props = {
  notices: readonly Notice[]
  presents: readonly Present[]
  read: ReadonlySet<number> // 開く前に読んでいたお知らせ（NEW の印に使う）
  onSeenNotices: () => void // お知らせのタブを見た
  onClaim: (id: number) => Promise<ClaimResult | null>
  onClose: () => void
}

export const SLIDE_MS = 220 // inbox.css の ib-in / ib-out と同じ

const dateText = (iso: string) => {
  const d = new Date(iso)
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`
}

export function Inbox({ notices, presents, read, onSeenNotices, onClaim, onClose }: Props) {
  const [tab, setTab] = useState<InboxTab>(() => firstTab(presents))
  const [wasRead] = useState(() => new Set(read)) // 開いた時点の既読（見ている間に NEW が消えないように）
  const [leaving, setLeaving] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => () => clearTimeout(timer.current), [])
  useEffect(() => {
    if (tab === 'notices') onSeenNotices()
  }, [tab, onSeenNotices])
  const leave = () => {
    if (leaving) return
    setLeaving(true)
    timer.current = setTimeout(onClose, SLIDE_MS)
  }
  const unclaimed = presents.filter((p) => !p.claimed).length
  const unread = notices.filter((n) => !wasRead.has(n.id)).length
  return (
    <section className={leaving ? 'ib ib--leaving' : 'ib'} aria-label="お知らせとプレゼント">
      <header className="ib__bar">
        <button type="button" className="ib__back" aria-label="戻る" onClick={leave}>
          <Icon name="back" size={20} />
        </button>
        <div className="ib__tabs" role="tablist">
          <button type="button" role="tab" aria-selected={tab === 'notices'} className={tab === 'notices' ? 'is-on' : ''} onClick={() => setTab('notices')}>
            お知らせ{unread > 0 && <i className="ib__dot" aria-label="未読あり" />}
          </button>
          <button type="button" role="tab" aria-selected={tab === 'presents'} className={tab === 'presents' ? 'is-on' : ''} onClick={() => setTab('presents')}>
            プレゼント{unclaimed > 0 && <i className="ib__dot" aria-label="受け取っていないものあり" />}
          </button>
        </div>
      </header>

      <div className="ib__list" role="tabpanel">
        {tab === 'notices' ? (
          notices.length === 0 ? (
            <p className="ib__empty">お知らせはありません</p>
          ) : (
            notices.map((n) => (
              <article key={n.id} className="ib__card">
                <header>
                  {!wasRead.has(n.id) && <span className="ib__new">NEW</span>}
                  <b>{n.title}</b>
                  <small>{dateText(n.at)}</small>
                </header>
                {n.body && <p>{n.body}</p>}
              </article>
            ))
          )
        ) : presents.length === 0 ? (
          <p className="ib__empty">プレゼントはありません</p>
        ) : (
          presents.map((p) => <PresentCard key={p.id} present={p} onClaim={onClaim} />)
        )}
      </div>
    </section>
  )
}

function PresentCard({ present: p, onClaim }: { present: Present; onClaim: Props['onClaim'] }) {
  const [busy, setBusy] = useState(false)
  const [state, setState] = useState<'expired' | 'failed' | null>(null)
  const expired = state === 'expired' || (!p.claimed && new Date(p.expiresAt).getTime() <= Date.now())
  const claim = async () => {
    if (busy) return
    setBusy(true)
    const r = await onClaim(p.id)
    setBusy(false)
    if (!r) return setState('failed')
    if (r.status === 'ok') sound.play('coin')
    if (r.status === 'expired' || r.status === 'not_found') setState('expired')
    else setState(null)
  }
  return (
    <article className={p.claimed ? 'ib__card ib__present is-claimed' : 'ib__card ib__present'}>
      <span className="ib__gift" aria-hidden="true">
        <Icon name="gift" size={26} />
      </span>
      <div className="ib__pbody">
        <b>{p.title}</b>
        {p.message && <p>{p.message}</p>}
        <span className="ib__coins">
          <CoinIcon size={18} />
          {`${p.coins}`}
        </span>
        {!p.claimed && !expired && <small className="ib__left">{`受け取り期限: ${expiryText(p.expiresAt, new Date())}`}</small>}
        {state === 'failed' && <small className="ib__err">受け取れませんでした。通信のよい所でもう一度。</small>}
      </div>
      {p.claimed ? (
        <span className="ib__done">受け取り済み</span>
      ) : expired ? (
        <span className="ib__done">期限切れ</span>
      ) : (
        <button type="button" className="ib__claim" disabled={busy} onClick={claim}>
          受け取る
        </button>
      )}
    </article>
  )
}
