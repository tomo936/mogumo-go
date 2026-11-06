// チェックイン成功の演出。紙吹雪（約1.2秒）→ 緑のバナー。約3秒で終わり、タップで飛ばせる。
import { useEffect, useRef, useState } from 'react'
import './checkin.css'
import { startConfetti } from './confetti.ts'

export const EFFECT_MS = 3000

type Props = { coins: 30 | 0; shopName: string; onDone: () => void }

const prefersReducedMotion = () =>
  typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

export function CheckinEffect({ coins, shopName, onDone }: Props) {
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

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    return startConfetti(canvas, canvas.clientWidth / 2, canvas.clientHeight * 0.55)
  }, [])

  return (
    <div className="checkin-effect" data-testid="checkin-effect" data-shop={shopName} onClick={finish}>
      {!reduced && <canvas ref={canvasRef} className="checkin-effect__confetti" data-testid="checkin-confetti" />}
      <div className="checkin-effect__banner" role="status">
        <span className="checkin-effect__check" aria-hidden="true">✓</span>
        <span className="checkin-effect__title">チェックイン完了</span>
        <span className="checkin-effect__coin">
          <span className="checkin-effect__coin-icon" aria-hidden="true" />
          {coins === 0 ? '今日のコインは受け取り済み' : '+30 コイン'}
        </span>
      </div>
    </div>
  )
}
