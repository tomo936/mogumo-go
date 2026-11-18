// 週ミッションのチケット3枚（気配のシートの下。2026-11-10 オーナー決定の C 案）。
// むずかしさの札・名前・ごほうび（コインの絵＋数字）・進み。押すと条件の説明が出る。達成は判子。
import { useState } from 'react'
import { CoinIcon } from '../../ui/CoinIcon.tsx'
import { DIFFICULTY_LABEL, daysLeftUntil, missionCondition, missionTitle } from '../domain/mission.ts'
import type { MissionWeek } from '../domain/mission.ts'
import './missions.css'

// 「1軒」の数字と単位のあいだで折り返さない
const keepUnit = (t: string) => t.replace(/(\d+)(軒|回|種類|日)/g, '$1\u2060$2')

export type MissionsState = { status: 'loading' } | { status: 'error' } | { status: 'ready'; week: MissionWeek }

type Props = { state: MissionsState; onRetry: () => void }

export function MissionTickets({ state, onRetry }: Props) {
  const [openId, setOpenId] = useState<string | null>(null)
  const [now] = useState(() => new Date())
  const missions = state.status === 'ready' ? state.week.missions : []
  const open = missions.find((m) => m.id === openId) ?? null
  return (
    <section className="mission" aria-label="今週のミッション">
      <div className="mission__head">
        <h3>今週のミッション</h3>
        {state.status === 'ready' && missions.length > 0 && <span>{`のこり ${daysLeftUntil(state.week.weekEnd, now)}日`}</span>}
      </div>
      {state.status === 'loading' && <p className="mission__note">ミッションを読んでいます…</p>}
      {state.status === 'error' && (
        <div className="mission__error">
          <p className="mission__note" role="status">ミッションを読めませんでした</p>
          <button type="button" className="explore-sheet__retry" onClick={onRetry}>もう一度</button>
        </div>
      )}
      {state.status === 'ready' && missions.length === 0 && <p className="mission__note">今週のミッションはまだありません</p>}
      {missions.length > 0 && (
        <ul className="mission__strip">
          {missions.map((m) => (
            <li key={m.id}>
              <button
                type="button"
                className={`mission-ticket mission-ticket--${m.difficulty}${m.completed ? ' is-done' : ''}${openId === m.id ? ' is-open' : ''}`}
                aria-expanded={openId === m.id}
                aria-label={`${DIFFICULTY_LABEL[m.difficulty]} ${missionTitle(m)} ${m.progress}/${m.target}${m.completed ? ' 達成' : ''} ${m.reward}コイン`}
                onClick={() => setOpenId((id) => (id === m.id ? null : m.id))}
              >
                {m.completed && <span className="mission-ticket__stamp" aria-hidden="true">達成</span>}
                <span className="mission-ticket__level">{DIFFICULTY_LABEL[m.difficulty]}</span>
                <b className="mission-ticket__title">{keepUnit(missionTitle(m))}</b>
                <span className="mission-ticket__reward"><CoinIcon size={16} />{m.reward}</span>
                <span className="mission-ticket__gauge" aria-hidden="true"><i style={{ width: `${Math.min(100, (m.progress / Math.max(1, m.target)) * 100)}%` }} /></span>
                <small>{`${m.progress} / ${m.target}`}</small>
              </button>
            </li>
          ))}
        </ul>
      )}
      {open && (
        <p className="mission__detail" role="status">
          {`${missionCondition(open)}。達成で ${open.reward} コイン`}
        </p>
      )}
      {missions.length > 0 && <p className="mission__note">気配のお店もミッションに数えます</p>}
    </section>
  )
}
