// お店をタップしたときに下から出るシート。① 小さい段 ⇄ ② 全画面（上にスライド／持ち手を押す）。
// 全画面は写真のシール（無い店は種類の絵）と「わたしの記録」。設計 docs/superpowers/specs/2026-11-09-shop-sheet-design.md
// チェックインのボタンは 50m 以内だけ押せる。
import { useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import './checkin.css'
import '../../hints/ui/hints.css'
import type { Shop, ShopKind } from '../../shops/domain/shop.ts'
import { hotpepperPageUrl } from '../../shops/domain/hotpepperLink.ts'
import { PIN_ICON } from '../../shops/infra/pinIcons.ts'
import { CHECKIN_M } from '../../shops/config.ts'
import { formatOpen } from '../domain/openHours.ts'
import { frameTier, nextTier } from '../domain/visits.ts'
import { dragHeight, sheetStop } from '../domain/sheetDrag.ts'
import type { SheetStop } from '../domain/sheetDrag.ts'
import type { FrameTier, Visits } from '../domain/visits.ts'
import { hintLines } from '../../hints/domain/hint.ts'
import type { DailyHint } from '../../hints/domain/hint.ts'

export type CheckinError = 'too_far' | 'network' | 'not_found' | 'no_profile' | 'already_today'

const ERROR_TEXT: Record<CheckinError, string> = {
  too_far: 'お店から50mより遠いようです',
  network: '通信できませんでした。記録されていることもあるので、少し待ってからもう一度押してください',
  not_found: 'このお店は見つかりませんでした',
  no_profile: '初回設定を終えてからチェックインできます',
  already_today: 'このお店は今日もうチェックインしました。また明日来てね',
}

const TIER_NAME: Record<FrameTier, string> = { normal: 'ふつう', silver: '銀', gold: '金' }
const MOVE_PX = 6 // これより動いたら「引いている」（それまではボタンのタップとして扱う）
const SETTLE_MS = 280 // 指を離してから段に収まるまで（CSS の transition と同じ）

// 写真の無い店のシールに入れる、種類の模型の絵
const cards = import.meta.glob('../../assets/shops/cards/*.webp', { eager: true, query: '?url', import: 'default' }) as Record<string, string>
const cardUrl = (kind: ShopKind) => cards[`../../assets/shops/cards/${kind}.webp`] ?? cards['../../assets/shops/cards/mystery.webp']

// '2026-11-03' → '11/3'
const parts = (day: string) => day.split('-').map(Number) as [number, number, number]
const shortDay = (day: string) => `${parts(day)[1]}/${parts(day)[2]}`

type Props = {
  shop: Shop
  distanceM: number
  doneToday?: boolean // 今日もうチェックインしたお店
  hint?: DailyHint | null // 今日の気配の店なら、その気配
  masked?: boolean // 気配の正体をまだ明かしていない（名前・写真・営業時間・ひと言を伏せ、ヒントを出す）
  visits?: Visits | null // わたしの記録（0回は null）
  recordReady?: boolean // 記録を読み終えたか。false なら記録の欄を出さない（既定: visits があれば true）
  busy: boolean
  error: CheckinError | null
  onCheckin: () => void
  onClose: () => void
}

export function ShopSheet({ shop, distanceM, doneToday = false, hint = null, masked = false, visits = null, recordReady, busy, error, onCheckin, onClose }: Props) {
  const [expanded, setExpanded] = useState(false)
  const [height, setHeight] = useState<number | null>(null) // 引いている間・全画面の高さ（px）。小さい段で止まっているときは null（中身の高さ）
  const [animating, setAnimating] = useState(false)
  const sectionRef = useRef<HTMLElement>(null)
  const smallH = useRef(0)
  const drag = useRef<{ from: 'small' | 'full'; startY: number; startH: number; moved: boolean; id: number } | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current)
  }, [])
  const bodyRef = useRef<HTMLDivElement>(null)
  const inRange = distanceM <= CHECKIN_M
  const d = shop.details
  const open = masked ? null : d?.open
  const photo = masked ? null : (d?.photoUrl ?? null)
  const hpUrl = masked ? null : hotpepperPageUrl(shop.id)
  const showRecord = recordReady ?? visits !== null
  const count = visits?.count ?? 0
  const tier = frameTier(count)
  const next = nextTier(count)
  const name = masked ? '？？？' : shop.name

  // 指で引くとシートがついてきて、離すと段（小さい／全画面／閉じる）になめらかに収まる。
  // 全画面では中身がスクロールするので、引けるのは中身の外（上の持ち手のあたり）だけ
  const fullH = () => window.innerHeight
  const currentH = () => sectionRef.current?.offsetHeight ?? 0
  const settle = (stop: SheetStop) => {
    if (timer.current) clearTimeout(timer.current)
    if (!expanded && height === null) smallH.current = currentH()
    const from = height ?? currentH()
    setAnimating(true)
    setHeight(from)
    const to = stop === 'full' ? fullH() : stop === 'small' ? smallH.current : 0
    if (stop === 'full') setExpanded(true)
    // 今の高さを置いてから次のコマで行き先へ（CSS の transition が効くように）
    requestAnimationFrame(() => requestAnimationFrame(() => setHeight(to)))
    timer.current = setTimeout(() => {
      setAnimating(false)
      if (stop === 'close') onClose()
      else if (stop === 'small') {
        setExpanded(false)
        setHeight(null)
      }
    }, SETTLE_MS)
  }
  const onPointerDown = (e: ReactPointerEvent) => {
    if (expanded && bodyRef.current?.contains(e.target as Node)) return // 中身のスクロールに任せる
    if (!expanded && height === null) smallH.current = currentH()
    drag.current = { from: expanded ? 'full' : 'small', startY: e.clientY, startH: currentH(), moved: false, id: e.pointerId }
  }
  const onPointerMove = (e: ReactPointerEvent) => {
    const g = drag.current
    if (!g) return
    const dy = e.clientY - g.startY
    if (!g.moved) {
      if (Math.abs(dy) < MOVE_PX) return
      g.moved = true
      sectionRef.current?.setPointerCapture?.(g.id) // 引き始めたら、指が外へ出ても追う（タップのうちは取らない）
    }
    const h = dragHeight(g.startH, dy, fullH())
    setAnimating(false)
    setHeight(h)
    if (!expanded && h > smallH.current + 40) setExpanded(true) // 引き上げている途中で中身を全画面の形に
  }
  const onPointerUp = (e: ReactPointerEvent) => {
    const g = drag.current
    drag.current = null
    if (!g?.moved) return
    const dy = e.clientY - g.startY
    settle(sheetStop(g.from, dy, dragHeight(g.startH, dy, fullH()), smallH.current))
  }

  const tags = (
    <div className="shop-sheet__tags">
      {!masked && d?.genreName && <span className="shop-tag shop-tag--genre">{d.genreName}</span>}
      {!masked && d?.budgetName && <span className="shop-tag shop-tag--budget">{d.budgetName}</span>}
      {hint && !hint.completed && <span className="hint-tag">気配の店 +10</span>}
    </div>
  )
  const hintRows = masked && hint ? hintLines(hint).map((l) => <p key={l} className="shop-sheet__open">{l}</p>) : null
  const sticker = (big: boolean) => (
    <div className={`shop-sticker shop-sticker--${tier}${big ? ' shop-sticker--big' : ''}`}>
      {big && <span className="shop-sticker__tape" aria-hidden="true" />}
      <div className="shop-sticker__window">
        {photo ? (
          <img src={photo} alt={`${shop.name} の写真`} referrerPolicy="no-referrer" />
        ) : (
          <img
            className="shop-sticker__model"
            src={masked ? cardUrl('mystery') : big ? cardUrl(shop.kind) : PIN_ICON[shop.kind]}
            alt={masked ? '？' : `${shop.name} の絵`}
          />
        )}
      </div>
      {/* 自分の写真と間違えないよう、お店の写真には出どころだけ書く（日付は記録の欄に） */}
      {big && photo && <span className="shop-sticker__label">写真: ホットペッパーグルメ</span>}
    </div>
  )
  const button = (
    <button type="button" className="shop-sheet__go" disabled={doneToday || !inRange || busy} onClick={onCheckin}>
      {doneToday ? '今日はチェックイン済み' : busy ? 'チェックイン中…' : inRange ? 'チェックイン' : `あと ${Math.ceil(distanceM - CHECKIN_M)}m`}
    </button>
  )
  const errorRow = error && (
    <p className="shop-sheet__error" role="alert">
      {ERROR_TEXT[error]}
    </p>
  )

  return (
    <section
      ref={sectionRef}
      className={`shop-sheet${expanded ? ' shop-sheet--full' : ''}${animating ? ' shop-sheet--settling' : ''}`}
      style={height === null ? undefined : { height }}
      aria-label="お店の情報"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => {
        const g = drag.current
        drag.current = null
        if (g?.moved) settle(g.from)
      }}
    >
      <button
        type="button"
        className="shop-sheet__grab"
        aria-label={expanded ? '小さくする' : 'くわしく見る'}
        onClick={() => settle(expanded ? 'small' : 'full')}
      />
      <button type="button" className="shop-sheet__close" aria-label="閉じる" onClick={onClose}>
        ×
      </button>
      {!expanded ? (
        <>
          <div className="shop-sheet__head">
            {sticker(false)}
            <div>
              <h2 className="shop-sheet__name">{name}</h2>
              {tags}
              {hintRows ?? (open && <p className="shop-sheet__open">{formatOpen(open)}</p>)}
              <p className="shop-sheet__distance">
                {`ここから ${Math.ceil(distanceM)}m`}
                {visits && <b className="shop-sheet__count">{`${visits.count}回行った`}</b>}
              </p>
            </div>
          </div>
          {errorRow}
          {button}
          <p className="shop-sheet__more">︿ 上にスライドでくわしく</p>
        </>
      ) : (
        <div className="shop-sheet__body" ref={bodyRef}>
          {sticker(true)}
          <h2 className="shop-sheet__name shop-sheet__name--big">{name}</h2>
          {tags}
          {hintRows}
          {open && <p className="shop-sheet__open">{formatOpen(open)}</p>}
          {!masked && d?.catch && <p className="shop-sheet__catch">{d.catch}</p>}
          {!d && !masked && <p className="shop-sheet__open">くわしい情報はまだありません（地図のデータのお店）</p>}
          <p className="shop-sheet__distance">{`ここから ${Math.ceil(distanceM)}m`}</p>
          {showRecord && (
            <div className="shop-record">
              <p className="shop-record__title">わたしの記録</p>
              {visits ? (
                <>
                  <div className="shop-record__stats">
                    <div>
                      <b>{`${visits.count}回`}</b>行った
                    </div>
                    <div>
                      <b>{shortDay(visits.firstDay)}</b>はじめて
                    </div>
                    <div>
                      <b>{shortDay(visits.lastDay)}</b>この前
                    </div>
                  </div>
                  {next && (
                    <>
                      <p className="shop-record__next">{`あと${next.remaining}回で${TIER_NAME[next.tier]}の枠`}</p>
                      <div className="shop-record__bar" aria-hidden="true">
                        <i style={{ width: `${Math.round((count / (count + next.remaining)) * 100)}%` }} />
                      </div>
                    </>
                  )}
                </>
              ) : (
                <p className="shop-record__next">
                  まだ行っていません。チェックインで <b>+30</b>
                </p>
              )}
            </div>
          )}
          {errorRow}
          {button}
          {hpUrl && (
            <>
              <a className="shop-sheet__hp" href={hpUrl} target="_blank" rel="noopener noreferrer">
                ホットペッパーで見る
              </a>
              <p className="shop-sheet__credit">Powered by ホットペッパーグルメ Webサービス</p>
            </>
          )}
        </div>
      )}
    </section>
  )
}
