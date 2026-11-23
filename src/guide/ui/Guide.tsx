// ポコタンの案内（A5・案A ノベル型）。設計 docs/superpowers/specs/2026-11-17-pokotan-guide-design.md
// 下にセリフの窓、左上に Live2D のポコタン。説明する部品のところだけ丸く明るく抜く。タップで次へ、右上でスキップ。
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import './guide.css'
import { GUIDE_PAGES, holeAround, mouthAt, onTap, shownChars, unionRect } from '../domain/guide.ts'
import type { GuideTarget, Hole } from '../domain/guide.ts'
import { mountPoko } from '../infra/poko.ts'
import type { PokoHandle } from '../infra/poko.ts'
import pokoStill from '../../assets/guide/poko.webp'
import { sound } from '../../sound/infra/sound.ts'
import { debugOn } from '../../map/ui/debugOverlay.ts'

type Props = {
  onClose: () => void
  // false のあいだは見えない控えの状態で組み立てておく（ポコタンの絵の準備を先に済ませる）。true にした瞬間に見せて、文字を出し始める。
  // 空から降りている間に控えで用意し、降り終わった瞬間に true にする（2026-11-23 オーナー「降りてから案内まで間があってはいけない」）
  active?: boolean
}

const SELECTOR: Partial<Record<GuideTarget, string>> = { hint: '.hud-hint', menu: '.hud-toggle', player: '.hud-player, .hud-coins' }
const STILL_AFTER_MS = 6000 // これまでに Live2D が出なければ、止まった絵にする

function holeFor(target: GuideTarget): Hole | null {
  const sel = SELECTOR[target]
  const box = sel ? unionRect([...document.querySelectorAll(sel)].map((el) => el.getBoundingClientRect())) : null
  return box ? holeAround(box, 10) : null
}

export function Guide({ onClose, active = true }: Props) {
  const [page, setPage] = useState(0)
  const [shown, setShown] = useState(0)
  const [hole, setHole] = useState<Hole | null>(null)
  const [still, setStill] = useState(false) // Live2D が使えないときは止まった絵
  const [stage, setStage] = useState('') // ?debug のときだけ出す（Live2D の読み込みがどこまで進んだか）
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const pokoRef = useRef<PokoHandle | null>(null)
  const { text, target } = GUIDE_PAGES[page]
  const done = shown >= text.length

  useLayoutEffect(() => {
    if (active) performance.mark('mogumo:guide-open') // 測定用（降り終わりから見えるまでの間を測る。scripts/e2e/s15.mjs）
  }, [active])

  useEffect(() => {
    let alive = true
    let handle: PokoHandle | null = null
    const giveUp = setTimeout(() => alive && !handle && setStill(true), STILL_AFTER_MS)
    mountPoko(canvasRef.current!, (st) => alive && setStage(st))
      .then((h) => {
        if (!alive) return h.dispose()
        handle = h
        pokoRef.current = h
      })
      .catch((e: unknown) => {
        if (!alive) return
        setStage(`error ${e instanceof Error ? e.message : String(e)}`)
        setStill(true)
      })
    return () => {
      alive = false
      clearTimeout(giveUp)
      pokoRef.current = null
      handle?.dispose()
    }
  }, [])

  // 1 字ずつ出す（見せてから）
  useEffect(() => {
    if (!active) return
    const t0 = performance.now()
    setShown(0)
    const id = setInterval(() => {
      const n = shownChars(text, performance.now() - t0)
      setShown((prev) => Math.max(prev, n)) // タップで全部出したあとに巻き戻さない
      if (n >= text.length) clearInterval(id)
    }, 30)
    return () => clearInterval(id)
  }, [text, active])

  // 字の出方に合わせて口を開け閉めする（区切りと出きったあとは閉じる）
  useEffect(() => pokoRef.current?.setMouth(mouthAt(text, shown)), [text, shown])

  useLayoutEffect(() => setHole(holeFor(target)), [target, active])

  const tap = () => {
    sound.play('tap') // 進むたびに「ぽこっ」（窓は button ではないので、ここで鳴らす）
    const a = onTap(page, done)
    if (a === 'reveal') setShown(text.length)
    else if (a === 'next') setPage(page + 1)
    else onClose()
  }

  return (
    <div className={active ? 'guide' : 'guide guide--standby'} role="dialog" aria-label="ポコタンの案内" aria-hidden={active ? undefined : true} onClick={tap}>
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
        {still && <img src={pokoStill} alt="" />}
        <canvas ref={canvasRef} hidden={still} />
      </div>
      <div className="guide__box" aria-live="polite">
        <div className="guide__name">ポコタン</div>
        <p className="guide__say">{text.slice(0, shown)}</p>
        {done && <div className="guide__next" aria-hidden="true">▼</div>}
        {debugOn(window.location.search) && <div className="guide__debug">{`poko: ${stage}${still ? ' (still)' : ''}`}</div>}
      </div>
    </div>
  )
}
