// 記録（全画面）。天からの地図＋日付スライダー、数字、行ったお店の履歴、町のクリア・コンプリート。
// 仕様: S6 / S7（歩いた道は記録しない）。名前: 町は「クリア」「コンプリート」（2026-11-10 オーナー決定）。
// 町: 一覧は今の進み具合（サーバーの関数 towns）。晴れた広さ・地図・実績には、クリアした町の広さを足す
// （設計 docs/superpowers/specs/2026-11-10-towns-design.md §7）。
import { useEffect, useMemo, useRef, useState } from 'react'
import './record.css'
import { Icon } from '../../ui/Icon.tsx'
import { kindIcon } from '../../zukan/ui/cardArt.ts'
import { loadAllMine, photoUrls } from '../../reviews/infra/reviewsApi.ts'
import { KIND_LABEL } from '../../shops/domain/kindLabel.ts'
import { expFromShopIds, levelFor } from '../../zukan/domain/level.ts'
import { loadRecord } from '../infra/recordApi.ts'
import { RecordMap } from './RecordMap.tsx'
import type { LatLng } from '../../map/domain/geo.ts'
import { groupByMonth, timeRange, type ClearedCell, type VisitEntry } from '../domain/timeline.ts'
import { pinsAt, stepVisitDay, visitsOnDay } from '../domain/dayPins.ts'
import { jstDay } from '../../checkin/domain/day.ts'
import { evaluate } from '../../badges/domain/evaluate.ts'
import { BadgeList } from '../../badges/ui/BadgeList.tsx'
import { EatStatsCard } from './EatStatsCard.tsx'
import { RecordCalendar } from './RecordCalendar.tsx'
import { eatStats } from '../domain/eatStats.ts'
import { areaKm2At, areaTimeline } from '../../towns/domain/area.ts'
import type { ClearedTown } from '../../towns/domain/shape.ts'
import type { TownSync } from '../../towns/domain/progress.ts'
import { loadTownShapes, syncUntilSettled } from '../../towns/infra/townsApi.ts'
import type { OutlineTown } from '../../towns/domain/outline.ts'
import type { Geometry } from '../../towns/domain/shape.ts'
import { TownList, type TownListState } from '../../towns/ui/TownList.tsx'
import { WorldMap } from '../../world/ui/WorldMap.tsx'
import { PlaceView } from '../../world/ui/PlaceView.tsx'
import type { Shop } from '../../shops/domain/shop.ts'

type State = { status: 'loading' } | { status: 'error' } | { status: 'ready'; cells: ClearedCell[]; visits: VisitEntry[]; towns: ClearedTown[] }

const NO_CELLS: ClearedCell[] = []
const NO_VISITS: VisitEntry[] = []
const NO_TOWNS: ClearedTown[] = []
const NO_OUTLINES: OutlineTown[] = []

const WEEK = ['日', '月', '火', '水', '木', '金', '土']
const jstDate = (ms: number) => new Date(ms + 9 * 3600_000) // 日本時間（UTC の読み出しで使う）
const dayLabel = (ms: number) => {
  const d = jstDate(ms)
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`
}
// スライダーは1時間ずつ動くため、いちばん右でも最後の1時間ぶんに届かない。右の端に着いたら、最後の記録まで進める
const snapEnd = (ms: number, end: number) => (ms >= end - 3600_000 ? end : ms)
const dayWithWeek = (ms: number) => `${dayLabel(ms)}（${WEEK[jstDate(ms).getUTCDay()]}）`
const timeLabel = (ms: number) => {
  const d = jstDate(ms)
  return `${d.getUTCHours()}:${String(d.getUTCMinutes()).padStart(2, '0')}`
}

export type RecordTab = 'record' | 'badges'

type Props = {
  home: LatLng | null
  onClose: () => void
  onLocate?: (shop: Shop) => void // ワールドマップの「見るだけの地図」で「地図で見る」を押した: 記録を閉じて、いつもの地図でそのお店へ
  initialTab?: RecordTab
  onTownSync?: (s: TownSync) => void // 開いているあいだに町をクリア・コンプリートしたとき（地図の画面が帯と霧に使う）
}

export function Record({ home, onClose, initialTab = 'record', onTownSync, onLocate }: Props) {
  const [state, setState] = useState<State>({ status: 'loading' })
  const [townState, setTownState] = useState<TownListState>({ status: 'loading' })
  const [gained, setGained] = useState<ClearedTown[]>(NO_TOWNS) // 開いているあいだに新しくクリアした町
  const [tab, setTab] = useState<RecordTab>(initialTab)
  const [byStep, setByStep] = useState(false) // 日付を ‹ › で送ったときだけ、晴れる動きを見せる（スライダーは引いたぶんをすぐ反映）
  const [showRange, setShowRange] = useState(false) // 「町の範囲」（行った町の境目と名前）を地図に出すか
  const [shapes, setShapes] = useState<Map<string, { name: string; geom: Geometry; bbox: OutlineTown['bbox'] }> | null>(null)
  const [worldOpen, setWorldOpen] = useState(false) // ワールドマップ（日本全体）を重ねて出す
  const [place, setPlace] = useState<{ name: string; center: LatLng; zoom: number; townId?: string } | null>(null) // 飛んだ先（見るだけ）
  const [t, setT] = useState<number | null>(null) // スライダーの日付（null = いちばん新しい）

  useEffect(() => {
    let alive = true
    loadRecord()
      .then((r) => alive && setState({ status: 'ready', cells: r.cells, visits: r.visits, towns: r.towns }))
      .catch(() => alive && setState({ status: 'error' }))
    return () => {
      alive = false
    }
  }, [])

  // 町の進み具合。サーバーが数えている途中なら、間をあけて聞き直す（返事のたびに一覧を更新）
  const onTownSyncRef = useRef(onTownSync)
  useEffect(() => {
    onTownSyncRef.current = onTownSync
  })
  useEffect(() => {
    const closed = new AbortController() // 閉じたら聞き直しを止める
    const alive = () => !closed.signal.aborted
    let got = false
    void syncUntilSettled(
      (s) => {
        got = true
        setTownState({ status: 'ready', towns: s.towns, more: s.more })
        const fresh = s.newly.flatMap((n) => (n.kind === 'clear' && n.town ? [n.town] : []))
        if (fresh.length > 0) setGained((g) => [...g, ...fresh.filter((t) => !g.some((x) => x.id === t.id))])
        if (s.newly.length > 0) onTownSyncRef.current?.(s)
      },
      { alive },
    ).then(() => {
      if (alive() && !got) setTownState({ status: 'error' })
    })
    return () => closed.abort()
  }, [])

  // 範囲を出すと決めたとき、行った町（サーバーの一覧）の形をまとめて読む（一度読んだ町は読み直さない）
  const progressIds = townState.status === 'ready' ? townState.towns.map((x) => x.id).join('|') : ''
  const loadedShapes = useRef(new Map<string, unknown>()) // 読み終えた町（増えた分だけ読む）
  useEffect(() => {
    if (!showRange || progressIds === '') return
    const want = progressIds.split('|').filter((id) => !loadedShapes.current.has(id))
    if (want.length === 0) return
    const closed = new AbortController()
    loadTownShapes(want)
      .then((got) => {
        if (closed.signal.aborted) return
        for (const id of got.keys()) loadedShapes.current.set(id, true)
        setShapes((prev) => new Map([...(prev ?? []), ...got]))
      })
      .catch(() => {
        if (!closed.signal.aborted) setShowRange(false) // 読めなければスイッチを戻す（押したのに何も出ない状態にしない）
      })
    return () => closed.abort()
  }, [showRange, progressIds])

  const cells = state.status === 'ready' ? state.cells : NO_CELLS
  const visits = state.status === 'ready' ? state.visits : NO_VISITS
  const loadedTowns = state.status === 'ready' ? state.towns : NO_TOWNS
  const towns = useMemo(
    () => (gained.length === 0 ? loadedTowns : [...loadedTowns, ...gained.filter((g) => !loadedTowns.some((t) => t.id === g.id))]),
    [loadedTowns, gained],
  )
  const outlines = useMemo(() => {
    if (!showRange || !shapes || townState.status !== 'ready') return NO_OUTLINES
    const clearedIds = new Set(towns.map((x) => x.id))
    return townState.towns.flatMap((p) => {
      const sh = shapes.get(p.id)
      return sh ? [{ id: p.id, name: sh.name, geom: sh.geom, bbox: sh.bbox, cleared: p.clearedAt !== null || clearedIds.has(p.id) }] : []
    })
  }, [showRange, shapes, townState, towns])
  const area = useMemo(() => areaTimeline(cells, towns), [cells, towns])
  // 自分の感想（チェックインごと）: 行ったお店の行に、その訪問の写真と星を出す（2026-11-24 記録を思い出に）。読めなければ出さないだけ
  const [mine, setMine] = useState<Map<string, { stars: number; photo: string | null }>>(new Map())
  useEffect(() => {
    if (state.status !== 'ready') return
    let alive = true
    void (async () => {
      try {
        const list = await loadAllMine()
        // 感想はチェックインごと。その訪問（チェックイン）の感想の星と写真だけを出す
        // （2026-11-24 オーナー「感想を書いた日以外にも感想の写真が出ている」。お店ごとにまとめていたのが原因）
        const paths = list.map((x) => x.photoPath).filter((x): x is string => x !== null)
        const urls = paths.length ? await photoUrls(paths).catch(() => new Map<string, string>()) : new Map<string, string>()
        if (!alive) return
        setMine(new Map(list.map((x) => [x.checkinId, { stars: x.stars, photo: x.photoPath ? urls.get(x.photoPath) ?? null : null }])))
      } catch {
        /* 感想が読めなくても記録はそのまま */
      }
    })()
    return () => {
      alive = false
    }
  }, [state.status])
  const [calOpen, setCalOpen] = useState(false) // 記録のカレンダーの画面（2026-11-24 B-24）
  const range = useMemo(() => timeRange(cells, towns.map((x) => x.at)), [cells, towns])
  const now = t ?? range?.end ?? 0
  const history = useMemo(() => groupByMonth(visits, now), [visits, now])
  // ピンとその日の一覧は、日付（日本時間）が変わったときだけ計算し直す（スライダーは1時間ずつ動くため）
  const dayKey = jstDay(new Date(now))
  const dayAt = useMemo(() => Date.parse(`${dayKey}T12:00:00+09:00`), [dayKey])
  const pins = useMemo(() => pinsAt(visits, dayAt), [visits, dayAt])
  const today = useMemo(() => visitsOnDay(visits, dayAt), [visits, dayAt])
  const visitedShops = new Set(history.flatMap((g) => g.items.map((i) => i.shopId))).size
  const lv = levelFor(expFromShopIds(visits.map((v) => v.shopId)))
  const badges = useMemo(() => (tab === 'badges' ? evaluate({ visits, cellTimes: area.cellTimes, townAreas: area.townAreas, home }) : []), [tab, visits, area, home])

  return (
    <section className="rc" aria-label="記録">
      <header className="rc__bar">
        <button type="button" className="rc__back" aria-label="戻る" onClick={onClose}>
          <Icon name="back" size={20} />
        </button>
        <h2>きろく</h2>
      </header>
      <div className="rc__tabs" role="tablist" aria-label="記録の切りかえ">
        <button type="button" role="tab" aria-selected={tab === 'record'} className={tab === 'record' ? 'is-on' : ''} onClick={() => setTab('record')}>きろく</button>
        <button type="button" role="tab" aria-selected={tab === 'badges'} className={tab === 'badges' ? 'is-on' : ''} onClick={() => setTab('badges')}>じっせき</button>
      </div>

      {state.status === 'loading' && <p className="rc__note">記録を開いています…</p>}
      {state.status === 'error' && <p className="rc__note" role="alert">記録を読み込めませんでした</p>}

      {state.status === 'ready' && tab === 'badges' && (
        <>
          <EatStatsCard stats={eatStats(visits, jstDay(new Date()))} towns={townState.status === 'ready' && !townState.more ? townState.towns.length : null} />
          <BadgeList states={badges} hasHome={home !== null} />
        </>
      )}

      {state.status === 'ready' && tab === 'record' && (
        <>
          <div className="rc__worldrow">
            {range !== null && (
              <button type="button" className="rc__cal" onClick={() => setCalOpen(true)}>
                <Icon name="calendar" size={18} />
                カレンダー
              </button>
            )}
            <button type="button" className="rc__world" onClick={() => setWorldOpen(true)}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18" /></svg>
              ワールドマップ
            </button>
          </div>
          {/* 日付の列は地図の上（2026-11-24 外のレビューの案 mock-b） */}
          {range !== null && (
            <div className="rc__slider">
              <div className="rc__slider-head">
                <button type="button" aria-label="前の行った日" onClick={() => { setByStep(true); setT(stepVisitDay(now, -1, visits, range)) }}><svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" /></svg></button>
                <b>
                  <Icon name="calendar" size={18} />
                  {today.length > 0 ? `${dayWithWeek(now)}　${today.length}軒` : dayWithWeek(now)}
                </b>
                <button type="button" aria-label="次の行った日" onClick={() => { setByStep(true); setT(stepVisitDay(now, 1, visits, range)) }}><svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" /></svg></button>
              </div>
              <input
                type="range"
                aria-label="日付"
                min={range.start}
                max={range.end}
                step={3600_000}
                value={now}
                onChange={(e) => { setByStep(false); setT(snapEnd(Number(e.target.value), range.end)) }}
              />
              <div className="rc__slider-ends"><span>{dayLabel(range.start)}</span><span>{dayLabel(range.end)}</span></div>
            </div>
          )}
          <div className="rc__mapcard">
            <RecordMap cells={cells} towns={towns} t={now} home={home} pins={pins} wave={byStep} outlines={outlines} />
            <button
              type="button"
              className="rc__range"
              aria-label={showRange ? '町の範囲を隠す' : '町の範囲を出す'}
              aria-pressed={showRange}
              onClick={() => setShowRange((v) => !v)}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M5 7.5l6-3.5 8 4v8.5l-7 3.5-7-4z" strokeDasharray={showRange ? undefined : '3 3'} />
              </svg>
              <small>町</small>
            </button>
            {range === null && <p className="rc__empty">まだ晴れた場所がありません。お店に行くと、ここに光が広がります</p>}
          </div>


          {today.length > 0 && (
            <div className="rc__today">
              <h3 className="rc__h">この日に行ったお店</h3>
              {today.map((v, i) => (
                <div className="rc__today-item" key={`${v.shopId}-${v.at}`}>
                  <span className="rc__today-num">{i + 1}</span>
                  <Thumb photoUrl={mine.get(v.checkinId ?? '')?.photo ?? v.photoUrl} kind={v.kind} />
                  <div className="rc__item-main">
                    <b>{v.name}</b>
                    <span>
                      {timeLabel(v.at)}
                      {mine.has(v.checkinId ?? '') && <i className="rc__stars" aria-label={`自分の星 ${mine.get(v.checkinId ?? '')?.stars}`}>{'★'.repeat(mine.get(v.checkinId ?? '')?.stars ?? 0)}</i>}
                    </span>
                  </div>
                  <span className="rc__kind">{KIND_LABEL[v.kind]}</span>
                </div>
              ))}
            </div>
          )}

          <div className="rc__stats">
            <div><Icon name="cloud" size={20} /><b>{areaKm2At(area, now).toFixed(2)}</b><span>晴れた広さ(km²)</span></div>
            <div><Icon name="store" size={20} /><b>{visitedShops}</b><span>行ったお店</span></div>
            <div><Icon name="star" size={20} /><b>{`Lv ${lv.level}`}</b><span>いまのレベル</span></div>
          </div>

          <h3 className="rc__h">町のクリア・コンプリート</h3>
          <TownList state={townState} />

          <h3 className="rc__h">行ったお店</h3>
          {history.length === 0 ? (
            <p className="rc__note">この日までに行ったお店はありません</p>
          ) : (
            history.map((g) => (
              <div key={g.month}>
                <div className="rc__month">{g.month}</div>
                {g.items.map((v, i) => <VisitRow key={`${v.shopId}-${v.day}-${i}`} v={v} mine={mine} />)}
              </div>
            ))
          )}
        </>
      )}

      {calOpen && state.status === 'ready' && (
        <RecordCalendar
          visits={visits}
          mine={mine}
          month={dayKey.slice(0, 7)}
          today={jstDay(new Date())}
          selected={dayKey}
          onOpenDay={(d) => {
            // その日のいちばん遅いチェックインの時刻へ（‹ › と同じ動き）
            const at = Math.max(...visits.filter((v) => v.day === d).map((v) => v.at))
            setByStep(true)
            setT(at)
            setCalOpen(false)
          }}
          onClose={() => setCalOpen(false)}
        />
      )}
      {worldOpen && state.status === 'ready' && (
        <>
          <WorldMap
            towns={townState.status === 'ready' ? townState.towns : []}
            onClose={() => { setWorldOpen(false); setPlace(null) }}
            onOpen={setPlace}
          />
          {place && (
            <PlaceView
              center={place.center}
              zoom={place.zoom}
              cells={cells}
              towns={towns}
              visits={visits}
              home={home}
              town={place.townId && townState.status === 'ready' ? townState.towns.find((x) => x.id === place.townId) ?? null : null}
              onBack={() => setPlace(null)}
              onReturn={onClose}
              onLocate={onLocate}
            />
          )}
        </>
      )}
    </section>
  )
}

// お店の小さい写真。写真が無いお店は種類の絵（2026-11-24 外のレビューの案「行ったお店に写真と種類」）
function Thumb({ photoUrl, kind }: { photoUrl: string | null; kind: VisitEntry['kind'] }) {
  return (
    <span className={`rc__thumb${photoUrl ? '' : ' rc__thumb--kind'}`}>
      {/* 写真の期限付き URL が切れて読めないときは種類の絵に戻す */}
      <img src={photoUrl ?? kindIcon(kind)} alt="" onError={(e) => { if (photoUrl) { e.currentTarget.src = kindIcon(kind); e.currentTarget.parentElement?.classList.add('rc__thumb--kind') } }} />
    </span>
  )
}

// 行ったお店の 1 行（日付順・町ごとで同じ形）
function VisitRow({ v, mine }: { v: VisitEntry; mine: ReadonlyMap<string, { stars: number; photo: string | null }> }) {
  const r = mine.get(v.checkinId ?? '')
  return (
    <div className="rc__item">
      <Thumb photoUrl={r?.photo ?? v.photoUrl} kind={v.kind} />
      <div className="rc__item-main">
        <b>{v.name}</b>
        <span>
          {v.day.replaceAll('-', '.')}
          {r && <i className="rc__stars" aria-label={`自分の星 ${r.stars}`}>{'★'.repeat(r.stars)}</i>}
        </span>
      </div>
      <span className="rc__kind">{KIND_LABEL[v.kind]}</span>
    </div>
  )
}
