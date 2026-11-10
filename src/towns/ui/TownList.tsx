// 記録に出す、町の進み具合の一覧（最近行った町から）。半分でクリア、ぜんぶでコンプリート。
// 数はサーバーの関数 towns の返事（スライダーの日付とは関係なく、今の進み具合）。
import { percent } from '../domain/progress.ts'
import type { TownProgress } from '../domain/progress.ts'
import { TownIcon } from './TownIcon.tsx'
import './towns.css'

export type TownListState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; towns: TownProgress[]; more: boolean }

export function TownList({ state }: { state: TownListState }) {
  if (state.status === 'loading') return <p className="town-list__note">町の進み具合を読み込んでいます…</p>
  if (state.status === 'error') return <p className="town-list__note" role="alert">町の進み具合を読み込めませんでした</p>
  if (state.towns.length === 0) {
    return <p className="town-list__note">{state.more ? '町のお店を数えています…' : 'お店に行くと、町の進み具合がここに出ます'}</p>
  }
  return (
    <>
      <p className="town-list__rule">お店の半分でクリア、ぜんぶでコンプリート</p>
      <ul className="town-list" aria-label="町の進み具合">
        {state.towns.map((t) => {
          const pct = percent(t)
          const mark = t.completedAt !== null ? 'complete' : t.clearedAt !== null ? 'clear' : null
          return (
            <li key={t.id} className={`town-row${mark ? ` town-row--${mark}` : ''}`}>
              <span className="town-row__icon"><TownIcon kind={mark ?? 'none'} size={40} /></span>
              <div className="town-row__main">
                <div className="town-row__head">
                  <div className="town-row__name">
                    <b>{t.name}</b>
                    {t.city && <span>{t.city}</span>}
                  </div>
                  {mark && <span className="town-row__stamp">{mark === 'complete' ? 'コンプリート' : 'クリア'}</span>}
                </div>
                {t.counting ? (
                  <p className="town-row__counting">数えています…</p>
                ) : (
                  <div className="town-row__bar" role="progressbar" aria-label={`${t.name}の進み具合`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
                    <i style={{ width: `${pct}%` }} />
                    <span className="town-row__half" aria-hidden="true" />
                  </div>
                )}
              </div>
              {!t.counting && (
                <div className="town-row__num">
                  <span className="town-row__count">{`${t.visited} / ${t.total}`}</span>
                  <span className="town-row__pct">{`${pct}%`}</span>
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </>
  )
}
