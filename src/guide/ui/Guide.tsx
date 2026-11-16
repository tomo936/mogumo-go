// ポコタンの案内（A5・案A ノベル型）。設計 docs/superpowers/specs/2026-11-17-pokotan-guide-design.md
// 下にセリフの窓、左上に Live2D のポコタン。説明する部品のところだけ丸く明るく抜く。タップで次へ、右上でスキップ。
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import './guide.css'
import { GUIDE_PAGES, holeAround, onTap, shownChars, unionRect } from '../domain/guide.ts'
import type { GuideTarget, Hole } from '../domain/guide.ts'
import { mountPoko } from '../infra/poko.ts'
import type { PokoHandle } from '../infra/poko.ts'
import pokoStill from '../../assets/guide/poko.webp'
import { sound } from '../../sound/infra/sound.ts'

type Props = {
  meOnScreen: () => { x: number; y: number } | null
  onClose: () => void
}

const SELECTOR: Partial<Record<GuideTarget, string>> = { hint: '.hud-hint', menu: '.hud-toggle', player: '.hud-player, .hud-coins' }
const ME_R: Record<number, number> = { 1: 120, 2: 80 } // 自分のまわりの丸の大きさ（霧のページは広く、お店のページは近く）

function holeFor(target: GuideTarget, page: number, meOnScreen: Props['meOnScreen']): Hole | null {
  if (target === 'me') {
    const p = meOnScreen() ?? { x: window.innerWidth / 2, y: window.innerHeight / 2 }
    return { cx: p.x, cy: p.y, r: ME_R[page] ?? 100 }
  }
  const sel = SELECTOR[target]
  const box = sel ? unionRect([...document.querySelectorAll(sel)].map((el) => el.getBoundingClientRect())) : null
  return box ? holeAround(box, 10) : null
}

export function Guide({ meOnScreen, onClose }: Props) {
  const [page, setPage] = useState(0)
  const [shown, setShown] = useState(0)
  const [hole, setHole] = useState<Hole | null>(null)
  const [still, setStill] = useState(false) // Live2D が使えないときは止まった絵
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const pokoRef = useRef<PokoHandle | null>(null)
  const { text, target } = GUIDE_PAGES[page]
  const done = shown >= text.length

  useEffect(() => {
    let alive = true
    let handle: PokoHandle | null = null
    mountPoko(canvasRef.current!)
      .then((h) => {
        if (!alive) return h.dispose()
        handle = h
        pokoRef.current = h
      })
      .catch(() => alive && setStill(true))
    return () => {
      alive = false
      pokoRef.current = null
      handle?.dispose()
    }
  }, [])

  // 1 字ずつ出す
  useEffect(() => {
    const t0 = performance.now()
    setShown(0)
    const id = setInterval(() => {
      const n = shownChars(text, performance.now() - t0)
      setShown(n)
      if (n >= text.length) clearInterval(id)
    }, 30)
    return () => clearInterval(id)
  }, [text])

  // 字が出ている間だけ口パク
  useEffect(() => pokoRef.current?.setTalking(!done), [done, shown])

  useLayoutEffect(() => setHole(holeFor(target, page, meOnScreen)), [target, page, meOnScreen])

  const tap = () => {
    sound.play('tap') // 進むたびに「ぽこっ」（窓は button ではないので、ここで鳴らす）
    const a = onTap(page, done)
    if (a === 'reveal') setShown(text.length)
    else if (a === 'next') setPage(page + 1)
    else onClose()
  }

  return (
    <div className="guide" role="dialog" aria-label="ポコタンの案内" onClick={tap}>
      {hole ? (
        <div className="guide__hole" style={{ left: hole.cx - hole.r, top: hole.cy - hole.r, width: hole.r * 2, height: hole.r * 2 }} />
      ) : (
        <div className="guide__dim" />
      )}
      <button
        type="button"
        className="guide__skip"
        onClick={(e) => {
          e.stopPropagation()
          onClose()
        }}
      >
        スキップ
      </button>
      <div className="guide__poko" aria-hidden="true">
        {still ? <img src={pokoStill} alt="" /> : <canvas ref={canvasRef} />}
      </div>
      <div className="guide__box" aria-live="polite">
        <div className="guide__name">ポコタン</div>
        <p className="guide__say">{text.slice(0, shown)}</p>
        {done && <div className="guide__next" aria-hidden="true">▼</div>}
      </div>
    </div>
  )
}
