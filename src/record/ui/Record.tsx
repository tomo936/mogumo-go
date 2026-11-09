// 記録（全画面）。天からの地図＋日付スライダー、数字、行ったお店の履歴、町のクリア・コンプリート（準備中）。
// 仕様: S6 / S7（歩いた道は記録しない）。名前: 町は「クリア」「コンプリート」（2026-11-10 オーナー決定）。
import { useEffect, useMemo, useState } from 'react'
import './record.css'
import { Icon } from '../../ui/Icon.tsx'
import { levelFor } from '../../zukan/domain/level.ts'
import { loadRecord } from '../infra/recordApi.ts'
import { TopDownMap } from './TopDownMap.tsx'
import { areaKm2, clearedAt, fadeFor, groupByMonth, stepWeek, timeRange, type ClearedCell, type VisitEntry } from '../domain/timeline.ts'

type State = { status: 'loading' } | { status: 'error' } | { status: 'ready'; cells: ClearedCell[]; visits: VisitEntry[] }

const NO_CELLS: ClearedCell[] = []
const NO_VISITS: VisitEntry[] = []

const dayLabel = (ms: number) => {
  const d = new Date(ms + 9 * 3600_000) // 日本時間
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`
}

export function Record({ onClose }: { onClose: () => void }) {
  const [state, setState] = useState<State>({ status: 'loading' })
  const [t, setT] = useState<number | null>(null) // スライダーの日付（null = いちばん新しい）

  useEffect(() => {
    let alive = true
    loadRecord()
      .then((r) => alive && setState({ status: 'ready', cells: r.cells, visits: r.visits }))
      .catch(() => alive && setState({ status: 'error' }))
    return () => {
      alive = false
    }
  }, [])

  const cells = state.status === 'ready' ? state.cells : NO_CELLS
  const visits = state.status === 'ready' ? state.visits : NO_VISITS
  const range = useMemo(() => timeRange(cells), [cells])
  const now = t ?? range?.end ?? 0
  const fade = fadeFor(range)
  const shown = useMemo(() => clearedAt(cells, now), [cells, now])
  const history = useMemo(() => groupByMonth(visits, now), [visits, now])
  const visitedShops = new Set(history.flatMap((g) => g.items.map((i) => i.shopId))).size
  const lv = levelFor(new Set(visits.map((v) => v.shopId)).size)

  return (
    <section className="rc" aria-label="記録">
      <header className="rc__bar">
        <button type="button" className="rc__back" aria-label="戻る" onClick={onClose}>
          <Icon name="back" size={20} />
        </button>
        <h2>きろく</h2>
      </header>

      {state.status === 'loading' && <p className="rc__note">記録を開いています…</p>}
      {state.status === 'error' && <p className="rc__note" role="alert">記録を読み込めませんでした</p>}

      {state.status === 'ready' && (
        <>
          <div className="rc__mapcard">
            <TopDownMap cells={cells} t={now} fadeMs={fade} />
            {range === null && <p className="rc__empty">まだ晴れた場所がありません。お店に行くと、ここに光が広がります</p>}
          </div>

          {range !== null && (
            <div className="rc__slider">
              <div className="rc__slider-head">
                <button type="button" aria-label="1週間前" onClick={() => setT(stepWeek(now, -1, range))}>‹</button>
                <b>{dayLabel(now)}</b>
                <button type="button" aria-label="1週間後" onClick={() => setT(stepWeek(now, 1, range))}>›</button>
              </div>
              <input
                type="range"
                aria-label="日付"
                min={range.start}
                max={range.end}
                step={3600_000}
                value={now}
                onChange={(e) => setT(Number(e.target.value))}
              />
              <div className="rc__slider-ends"><span>{dayLabel(range.start)}</span><span>{dayLabel(range.end)}</span></div>
            </div>
          )}

          <div className="rc__stats">
            <div><b>{areaKm2(shown.length).toFixed(2)}</b><span>晴れた広さ(km²)</span></div>
            <div><b>{visitedShops}</b><span>行ったお店</span></div>
            <div><b>{`Lv ${lv.level}`}</b><span>いまのレベル</span></div>
          </div>

          <div className="rc__box rc__box--dashed">
            <div className="rc__box-title">町のクリア・コンプリート</div>
            <p>準備中です（町のデータを入れたあとに出ます）</p>
          </div>

          <h3 className="rc__h">行ったお店</h3>
          {history.length === 0 ? (
            <p className="rc__note">この日までに行ったお店はありません</p>
          ) : (
            history.map((g) => (
              <div key={g.month}>
                <div className="rc__month">{g.month}</div>
                {g.items.map((v, i) => (
                  <div className="rc__item" key={`${v.shopId}-${v.day}-${i}`}>
                    <span className="rc__thumb">{v.photoUrl ? <img src={v.photoUrl} alt="" /> : null}</span>
                    <div>
                      <b>{v.name}</b>
                      <span>{v.day.replaceAll('-', '.')}</span>
                    </div>
                  </div>
                ))}
              </div>
            ))
          )}
        </>
      )}
    </section>
  )
}
