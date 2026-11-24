// 記録のカレンダーの画面（2026-11-24 B-24）。行った日に印、月を切り替え、日を押すとその日の記録へ
import { useState } from 'react'
import { addMonths, countByDay, monthGrid } from '../domain/calendar.ts'

type Props = {
  visits: readonly { day: string }[]
  month: string // はじめに出す月 'YYYY-MM'
  today: string // 'YYYY-MM-DD'
  selected: string | null // 今見ている日
  onPick: (day: string) => void
  onClose: () => void
}

const WEEK = ['日', '月', '火', '水', '木', '金', '土']

export function RecordCalendar({ visits, month: first, today, selected, onPick, onClose }: Props) {
  const [month, setMonth] = useState(first)
  const counts = countByDay(visits)
  const grid = monthGrid(month)
  const inMonth = [...counts].filter(([d]) => d.startsWith(month)).reduce((s, [, n]) => s + n, 0)
  return (
    <section className="rcal" aria-label="記録のカレンダー">
      <header className="rcal__bar">
        <button type="button" className="rc__back" aria-label="戻る" onClick={onClose}>
          <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
        <h2>カレンダー</h2>
      </header>
      <div className="rcal__month">
        <button type="button" aria-label="前の月" onClick={() => setMonth(addMonths(month, -1))}>‹</button>
        <b>{`${month.slice(0, 4)}年${Number(month.slice(5))}月`}</b>
        <button type="button" aria-label="次の月" disabled={month >= today.slice(0, 7)} onClick={() => setMonth(addMonths(month, 1))}>›</button>
      </div>
      <p className="rcal__sum">{inMonth > 0 ? `この月は ${inMonth} 回のチェックイン` : 'この月のチェックインはありません'}</p>
      <div className="rcal__grid" role="grid">
        {WEEK.map((w, i) => (
          <span key={w} className={`rcal__w${i === 0 ? ' is-sun' : i === 6 ? ' is-sat' : ''}`}>{w}</span>
        ))}
        {grid.map((d) => {
          const n = counts.get(d.day) ?? 0
          const cls = `rcal__d${d.inMonth ? '' : ' is-out'}${d.day === today ? ' is-today' : ''}${d.day === selected ? ' is-sel' : ''}${n > 0 ? ' has' : ''}`
          return n > 0 ? (
            <button key={d.day} type="button" className={cls} aria-label={`${Number(d.day.slice(5, 7))}月${d.date}日 ${n}回`} onClick={() => onPick(d.day)}>
              <span>{d.date}</span>
              <i>{n}</i>
            </button>
          ) : (
            <span key={d.day} className={cls}>
              <span>{d.date}</span>
            </span>
          )
        })}
      </div>
      <p className="rcal__note">印のある日を押すと、その日の記録が見られます</p>
    </section>
  )
}
