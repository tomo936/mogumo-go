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
import { openNow } from '../domain/openNow.ts'
import { frameTier, nextTier } from '../domain/visits.ts'
import { dragHeight, sheetStop } from '../domain/sheetDrag.ts'
import type { SheetStop } from '../domain/sheetDrag.ts'
import type { FrameTier, Visits } from '../domain/visits.ts'
import type { Review } from '../../reviews/domain/review.ts'
import { hintLines } from '../../hints/domain/hint.ts'
import { Icon } from '../../ui/Icon.tsx'
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
const BELOW_PX = 28 // シートの下の端は画面の外へこれだけ出す（CSS の bottom: -28px と同じ。「まだ続く」見た目）

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
  onLocate?: () => void // 地図の視点をこのお店へ寄せる（図鑑から開いたときだけ出す。名前は仮）
  backLabel?: string | null // ビルの一覧から開いたとき、左上の「‹ ビル名」（押すと onBack）
  onBack?: () => void
  reviews?: { summary: { avg: number; count: number } | null; latest: Review[] } | null // みんなの感想（読み中・読めないは null）
  viewOnly?: boolean // 見るだけ（ワールドマップから飛んだ先）。チェックインのボタンと誤りの文を出さない
}

export function ShopSheet({ shop, distanceM, doneToday = false, hint = null, masked = false, visits = null, recordReady, busy, error, onCheckin, onClose, onLocate, backLabel = null, onBack, viewOnly = false, reviews = null }: Props) {
  const [expanded, setExpanded] = useState(false) // 止まっている段（全画面か）
  const [openedAt] = useState(() => new Date()) // 営業中かは、シートを開いた時刻で決める
  const [height, setHeight] = useState<number | null>(null) // 引いている間・全画面の高さ（px）。小さい段で止まっているときは null（中身の高さ）
  const [settling, setSettling] = useState<SheetStop | null>(null) // 指を離して収まっていく途中の行き先
  const sectionRef = useRef<HTMLElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const [smallH, setSmallH] = useState(0) // 小さい段の高さ（引き始めに測る）
  const drag = useRef<{ from: 'small' | 'full'; startY: number; startH: number; smallH: number; moved: boolean } | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current)
  }, [])
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
  // 中身は引いた分だけ入れかわる（小さい段の中身が薄れ、全画面の中身が下から浮かぶ）。チェックインのボタンは下に置いたまま
  const fullH = () => window.innerHeight + BELOW_PX // 全画面でも同じカードのまま、上の端が画面の上に来る高さ
  const currentH = () => sectionRef.current?.offsetHeight ?? 0
  // 中身の入れかわりの進み（0 = 小さい段の中身、1 = 全画面の中身）。収まっていく途中は行き先の値（CSS でなめらかに）
  const progress = (() => {
    if (settling) return settling === 'full' ? 1 : 0
    if (height === null) return expanded ? 1 : 0
    const span = fullH() * 0.6 - smallH
    return span <= 0 ? 1 : Math.min(1, Math.max(0, (height - smallH) / span))
  })()
  const settle = (stop: SheetStop) => {
    if (timer.current) clearTimeout(timer.current)
    const small = !expanded && height === null ? currentH() : smallH
    setSmallH(small)
    setSettling(stop)
    setHeight(height ?? currentH())
    const to = stop === 'full' ? fullH() : stop === 'small' ? small : 0
    // 今の高さを置いてから次のコマで行き先へ（CSS の transition が効くように）
    requestAnimationFrame(() => requestAnimationFrame(() => setHeight(to)))
    if (stop === 'full') setExpanded(true)
    timer.current = setTimeout(() => {
      setSettling(null)
      if (stop === 'close') onClose()
      else if (stop === 'small') {
        setExpanded(false)
        setHeight(null)
      }
    }, SETTLE_MS)
  }
  const begin = (y: number) => {
    const small = !expanded && height === null ? currentH() : smallH
    setSmallH(small)
    drag.current = { from: expanded ? 'full' : 'small', startY: y, startH: currentH(), smallH: small, moved: false }
  }
  // 引いているなら true（呼び出し側でスクロールなどを止める）
  const move = (y: number): boolean => {
    const g = drag.current
    if (!g) return false
    const dy = y - g.startY
    if (!g.moved) {
      if (Math.abs(dy) < MOVE_PX) return false
      g.moved = true
    }
    setSettling(null)
    setHeight(dragHeight(g.startH, dy, g.smallH, fullH()))
    return true
  }
  const end = (y: number | null) => {
    const g = drag.current
    drag.current = null
    if (!g?.moved) return
    if (y === null) return settle(g.from)
    const dy = y - g.startY
    settle(sheetStop(g.from, dy))
  }
  const live = useRef({ begin, move, end })
  useEffect(() => {
    live.current = { begin, move, end }
  })

  // 全画面の中身: 一番上までスクロールしているときに下へ引いたら、スクロールでなくシートを縮める（iPhone はタッチで扱う）
  const fullShown = expanded || progress > 0 || settling !== null
  useEffect(() => {
    const body = bodyRef.current
    if (!body || !fullShown) return
    const t: { startY: number; mode: 'undecided' | 'sheet' | 'scroll' } = { startY: 0, mode: 'undecided' }
    const onStart = (e: TouchEvent) => {
      t.startY = e.touches[0].clientY
      t.mode = 'undecided'
    }
    const onMove = (e: TouchEvent) => {
      const y = e.touches[0].clientY
      if (t.mode === 'undecided') {
        if (Math.abs(y - t.startY) < MOVE_PX) return
        if (y > t.startY && body.scrollTop <= 0) {
          t.mode = 'sheet'
          live.current.begin(t.startY)
        } else t.mode = 'scroll'
      }
      if (t.mode === 'sheet') {
        e.preventDefault()
        live.current.move(y)
      }
    }
    const onEnd = (e: TouchEvent) => {
      if (t.mode === 'sheet') live.current.end(e.changedTouches[0]?.clientY ?? null)
      t.mode = 'undecided'
    }
    body.addEventListener('touchstart', onStart, { passive: true })
    body.addEventListener('touchmove', onMove, { passive: false })
    body.addEventListener('touchend', onEnd)
    body.addEventListener('touchcancel', onEnd)
    return () => {
      body.removeEventListener('touchstart', onStart)
      body.removeEventListener('touchmove', onMove)
      body.removeEventListener('touchend', onEnd)
      body.removeEventListener('touchcancel', onEnd)
    }
  }, [fullShown])

  const onPointerDown = (e: ReactPointerEvent) => {
    // 全画面の中身はタッチの処理（上）とスクロールに任せる。マウスは中身の上でも引ける
    if (e.pointerType === 'touch' && bodyRef.current?.contains(e.target as Node)) return
    begin(e.clientY)
  }
  const onPointerMove = (e: ReactPointerEvent) => {
    const wasMoved = drag.current?.moved
    if (move(e.clientY) && !wasMoved) sectionRef.current?.setPointerCapture?.(e.pointerId) // 引き始めたら、指が外へ出ても追う（タップのうちは取らない）
  }

  const tags = (
    <div className="shop-sheet__tags">
      {!masked && d?.genreName && <span className="shop-tag shop-tag--genre">{d.genreName}</span>}
      {!masked && d?.budgetName && <span className="shop-tag shop-tag--budget">{d.budgetName}</span>}
      {hint && !hint.completed && <span className="hint-tag">気配の店 +10</span>}
    </div>
  )
  const hintRows = masked && hint ? hintLines(hint).map((l) => <p key={l} className="shop-sheet__open">{l}</p>) : null
  // big = 全画面の大きいシール。小さい段は手帳のカードの大きさ（shop-sticker--card）
  const sticker = (big: boolean) => (
    <div className={`shop-sticker shop-sticker--${tier}${big ? ' shop-sticker--big' : ' shop-sticker--card'}${photo ? '' : ' shop-sticker--map'}`}>
      <span className="shop-sticker__tape" aria-hidden="true" />
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
  const locateButton = onLocate && (
    <button type="button" className="shop-sheet__locate" onClick={onLocate}>
      地図で見る
    </button>
  )
  const button = (
    <button type="button" className="shop-sheet__go" disabled={doneToday || !inRange || busy} onClick={onCheckin}>
      {doneToday ? '今日はチェックイン済み' : busy ? 'チェックイン中…' : inRange ? 'チェックイン' : `あと ${Math.ceil(distanceM - CHECKIN_M)}m 近づくとチェックイン`}
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
      className={`shop-sheet${expanded ? ' shop-sheet--full' : ''}${settling ? ' shop-sheet--settling' : ''}`}
      style={height === null ? undefined : { height }}
      aria-label="お店の情報"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={(e) => end(e.clientY)}
      onPointerCancel={() => end(null)}
    >
      <button
        type="button"
        className="shop-sheet__grab"
        aria-label={expanded ? '小さくする' : 'シートを広げる'}
        onClick={() => settle(expanded ? 'small' : 'full')}
      />
      <button type="button" className="shop-sheet__close" aria-label="閉じる" onClick={onClose}>
        <Icon name="close" size={16} />
      </button>
      {onBack && (
        <button type="button" className="shop-sheet__back" onClick={onBack}>
          <Icon name="back" size={14} />
          {backLabel ?? 'このビル'}
        </button>
      )}
      <div className="shop-sheet__stage">
        {progress < 0.5 && (
          <div className="shop-sheet__head" style={{ opacity: 1 - progress * 2 }}>
            {sticker(false)}
            <div>
              <h2 className="shop-sheet__name">{name}</h2>
              {tags}
              {hintRows}
            </div>
          </div>
        )}
        {progress < 0.5 && (
          <p className="shop-facts" style={{ opacity: 1 - progress * 2 }}>
            <span className={inRange ? 'shop-facts__near' : undefined}>
              <Icon name="pin" size={16} />
              {`ここから ${Math.ceil(distanceM)}m`}
            </span>
            {open && <OpenFact text={open} now={openedAt} />}
            {showRecord && (visits ? (
              <span>
                <Icon name="star" size={16} />
                {`${visits.count}回行った`}
              </span>
            ) : (
              <span className="shop-facts__new">はじめてのお店</span>
            ))}
          </p>
        )}
        {fullShown && (
          <div
            className="shop-sheet__body"
            ref={bodyRef}
            style={progress < 1 ? { opacity: progress, pointerEvents: 'none', transform: `translateY(${Math.round((1 - progress) * 40)}px)` } : undefined}
          >
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
            {reviews && !masked && (
              <div className="shop-reviews">
                <p className="shop-record__title">
                  {reviews.summary ? `みんなの感想 ★${reviews.summary.avg.toFixed(1)}（${reviews.summary.count}件）` : 'みんなの感想'}
                </p>
                {reviews.latest.length === 0 ? (
                  <p className="shop-record__next">まだ感想がありません</p>
                ) : (
                  <ul className="shop-reviews__list">
                    {reviews.latest.map((r) => (
                      <li key={r.id}>
                        <span className="shop-reviews__name">{r.nickname ?? 'だれか'}</span>
                        <span className="shop-reviews__stars" aria-label={`星 ${r.stars}`}>{'★'.repeat(r.stars)}</span>
                        {r.body && <span className="shop-reviews__body">{r.body}</span>}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
            {hpUrl && (
              <>
                <a className="shop-sheet__hp" href={hpUrl} target="_blank" rel="noopener noreferrer">
                  ホットペッパーで見る
                </a>
              </>
            )}
          </div>
        )}
      </div>
      {/* チェックインのボタンは段が変わっても下に置いたまま */}
      <div className="shop-sheet__foot">
        {!viewOnly && errorRow}
        {!viewOnly && button}
        {locateButton}
        {!expanded && progress === 0 && (
          <button type="button" className="shop-sheet__more" onClick={() => settle('full')}>
            <span aria-hidden="true">︿</span>くわしく見る
          </button>
        )}
      </div>
    </section>
  )
}

// 営業中か（読めたとき）。読めない書き方なら営業時間の文をそのまま
function OpenFact({ text, now }: { text: string; now: Date }) {
  const o = openNow(text, now)
  const label =
    o.state === 'open' ? `営業中 ${o.until}まで` : o.state === 'closed' ? (o.from ? `準備中 ${o.from}から` : '営業時間外') : formatOpen(text)
  const cls = o.state === 'open' ? 'shop-facts__open is-open' : o.state === 'closed' ? 'shop-facts__open is-closed' : 'shop-facts__open'
  return (
    <span className={cls}>
      <Icon name="clock" size={16} />
      {label}
    </span>
  )
}
