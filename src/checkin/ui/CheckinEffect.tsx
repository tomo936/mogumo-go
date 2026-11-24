// チェックイン成功の演出。紙吹雪（約1.2秒）→ 緑のバナー。約3秒で終わり、タップで飛ばせる。
import { useEffect, useRef, useState } from 'react'
import './checkin.css'
import { startConfetti } from './confetti.ts'
import { checkinCues } from '../../sound/domain/sfx.ts'
import { sound } from '../../sound/infra/sound.ts'

export const EFFECT_MS = 3000

// reveal は、店名を伏せたままチェックインした店の名前（正体を帯に出す）
type Props = { coins: 0 | 30 | 40; exp?: number; levelUp?: number | null; reveal?: string | null; onDone: () => void }

const prefersReducedMotion = () =>
  typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

export function CheckinEffect({ coins, exp = 0, levelUp = null, reveal = null, onDone }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const doneRef = useRef(false)
  const onDoneRef = useRef(onDone)
  useEffect(() => {
    onDoneRef.current = onDone
  })
  const [reduced] = useState(prefersReducedMotion)

  const finish = () => {
    if (doneRef.current) return
    doneRef.current = true
    onDoneRef.current()
  }

  useEffect(() => {
    const t = setTimeout(finish, EFFECT_MS)
    return () => clearTimeout(t)
  }, [])

  // 音: ファンファーレ → 霧 → コイン → Lv アップ（A6）
  // 出たときに 1 回だけ（key を変えて出し直すので、値が変わることは無い）
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => sound.cues(checkinCues({ coins, levelUp })), [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    return startConfetti(canvas, canvas.clientWidth / 2, canvas.clientHeight * 0.55)
  }, [])

  return (
    <div className="checkin-effect" data-testid="checkin-effect" onClick={finish}>
      {!reduced && <canvas ref={canvasRef} className="checkin-effect__confetti" data-testid="checkin-confetti" />}
      <Stamp reduced={reduced} />
      <div className="checkin-effect__banner" role="status">
        <span className="checkin-effect__check" aria-hidden="true">✓</span>
        <span className="checkin-effect__title">
          チェックイン完了
          {reveal && <span className="checkin-effect__reveal">{`『${reveal}』だった！`}</span>}
        </span>
        <div className="checkin-effect__chips">
          <span className="checkin-effect__coin">
            <span className="checkin-effect__coin-icon" aria-hidden="true" />
            {coins === 0 ? '今日のコインは受け取り済み' : coins === 40 ? '+40 コイン（気配ボーナス +10）' : '+30 コイン'}
          </span>
          {exp > 0 && <span className="checkin-effect__exp">{`+${exp} EXP`}</span>}
          {levelUp !== null && <span className="checkin-effect__levelup">{`Lv ${levelUp} になった！`}</span>}
        </div>
      </div>
    </div>
  )
}

// 手帳に押すスタンプ（2026-11-24。B-18「チェックインはスタンプを押す演出に」）。絵は SVG で描く（画像なし）。
// 上から「ポン」と押されて少し沈み、インクが紙になじむ。動きを減らす設定のときは、押された形で出すだけ
function Stamp({ reduced }: { reduced: boolean }) {
  const d = new Date(Date.now() + 9 * 3600_000)
  const day = `${d.getUTCFullYear()}.${String(d.getUTCMonth() + 1).padStart(2, '0')}.${String(d.getUTCDate()).padStart(2, '0')}`
  return (
    <div className={`checkin-stamp${reduced ? ' checkin-stamp--still' : ''}`} aria-hidden="true">
      <svg viewBox="0 0 200 200" width="168" height="168">
        <defs>
          {/* インクのかすれ（1 回描くだけ。毎コマは動かさない） */}
          <filter id="stamp-ink" x="-10%" y="-10%" width="120%" height="120%">
            <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="7" result="n" />
            <feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -0.7 1.32" result="a" />
            <feComposite in="SourceGraphic" in2="a" operator="in" />
          </filter>
          <path id="stamp-top" d="M 38 100 A 62 62 0 0 1 162 100" />
          <path id="stamp-bottom" d="M 30 100 A 70 70 0 0 0 170 100" />
        </defs>
        <g filter="url(#stamp-ink)" fill="none" stroke="currentColor">
          <circle cx="100" cy="100" r="88" strokeWidth="7" />
          <circle cx="100" cy="100" r="76" strokeWidth="2.5" />
          <line x1="40" y1="84" x2="160" y2="84" strokeWidth="2.5" />
          <line x1="40" y1="128" x2="160" y2="128" strokeWidth="2.5" />
          <g fill="currentColor" stroke="none" fontFamily="'M PLUS Rounded 1c', sans-serif" fontWeight="800" textAnchor="middle">
            <text fontSize="17" letterSpacing="3"><textPath href="#stamp-top" startOffset="50%">MOGUMO GO</textPath></text>
            <text x="100" y="118" fontSize="34" letterSpacing="4">訪問</text>
            <text x="100" y="150" fontSize="15" letterSpacing="1">{day}</text>
            <text x="38" y="110" fontSize="16">★</text>
            <text x="162" y="110" fontSize="16">★</text>
          </g>
        </g>
      </svg>
    </div>
  )
}
