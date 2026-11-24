// 記録のカレンダーの画面（2026-11-24 B-24。オーナー「カレンダーの画面で、行ったお店を感想の画像と店名で見たい」）。
// 行った日の升目に写真（自分の感想の写真 → お店の写真 → 種類の絵）。日を押すと下にその日のお店の一覧、そこからその日の記録へ
import { useMemo, useState } from 'react'
import { addMonths, monthGrid } from '../domain/calendar.ts'
import type { VisitEntry } from '../domain/timeline.ts'
import { kindIcon } from '../../zukan/ui/cardArt.ts'
import { KIND_LABEL } from '../../shops/domain/kindLabel.ts'

type Mine = ReadonlyMap<string, { stars: number; photo: string | null }> // チェックインの番号ごと
type Props = {
  visits: readonly VisitEntry[]
  mine: Mine // 自分の感想（チェックインごと）
  month: string // はじめに出す月 'YYYY-MM'
  today: string // 'YYYY-MM-DD'
  selected: string | null // 今見ている日
  onOpenDay: (day: string) => void // その日の記録へ
  onClose: () => void
}

const WEEK = ['日', '月', '火', '水', '木', '金', '土']
const time = (ms: number) => {
  const d = new Date(ms + 9 * 3600_000)
  return `${d.getUTCHours()}:${String(d.getUTCMinutes()).padStart(2, '0')}`
}

export function RecordCalendar({ visits, mine, month: first, today, selected, onOpenDay, onClose }: Props) {
  const [month, setMonth] = useState(first)
  const [picked, setPicked] = useState<string | null>(selected)
  // 日ごとの訪問（早い順）
  const byDay = useMemo(() => {
    const m = new Map<string, VisitEntry[]>()
    for (const v of [...visits].sort((a, b) => a.at - b.at)) {
      if (!m.has(v.day)) m.set(v.day, [])
      m.get(v.day)!.push(v)
    }
    return m
  }, [visits])
  const photoOf = (v: VisitEntry) => mine.get(v.checkinId ?? '')?.photo ?? v.photoUrl
  // 升目の写真: その日の訪問のうち、写真のあるもの（自分の写真を優先）。無ければ最初のお店の種類の絵
  const cover = (list: VisitEntry[]) => {
    const own = list.find((v) => mine.get(v.checkinId ?? '')?.photo)
    const any = own ?? list.find((v) => v.photoUrl)
    return any ? { src: photoOf(any)!, photo: true } : { src: kindIcon(list[0].kind), photo: false }
  }
  const grid = monthGrid(month)
  const inMonth = [...byDay].filter(([d]) => d.startsWith(month)).reduce((s, [, l]) => s + l.length, 0)
  const dayList = picked ? byDay.get(picked) ?? [] : []
  return (
    <section className="rcal" aria-label="記録のカレンダー">
      <header className="rcal__bar">
        <button type="button" className="rc__back" aria-label="戻る" onClick={onClose}>
          <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
        <h2>カレンダー</h2>
      </header>
      <div className="rcal__month">
        <button type="button" aria-label="前の月" onClick={() => setMonth(addMonths(month, -1))}><svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" /></svg></button>
        <b>{`${month.slice(0, 4)}年${Number(month.slice(5))}月`}</b>
        <button type="button" aria-label="次の月" disabled={month >= today.slice(0, 7)} onClick={() => setMonth(addMonths(month, 1))}><svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" /></svg></button>
      </div>
      <p className="rcal__sum">{inMonth > 0 ? `この月は ${inMonth} 回のチェックイン` : 'この月のチェックインはありません'}</p>
      <div className="rcal__grid" role="grid">
        {WEEK.map((w, i) => (
          <span key={w} className={`rcal__w${i === 0 ? ' is-sun' : i === 6 ? ' is-sat' : ''}`}>{w}</span>
        ))}
        {grid.map((d) => {
          const list = byDay.get(d.day)
          const cls = `rcal__d${d.inMonth ? '' : ' is-out'}${d.day === today ? ' is-today' : ''}${d.day === picked ? ' is-sel' : ''}${list ? ' has' : ''}`
          if (!list) return <span key={d.day} className={cls}><span className="rcal__num">{d.date}</span></span>
          const c = cover(list)
          return (
            <button key={d.day} type="button" className={cls} aria-label={`${Number(d.day.slice(5, 7))}月${d.date}日 ${list.length}軒 ${list[0].name}`} aria-pressed={d.day === picked} onClick={() => setPicked(d.day)}>
              <img src={c.src} alt="" className={c.photo ? 'is-photo' : 'is-kind'} />
              <span className="rcal__num">{d.date}</span>
            </button>
          )
        })}
      </div>

      {picked && dayList.length > 0 && (
        <div className="rcal__day" aria-label={`${Number(picked.slice(5, 7))}月${Number(picked.slice(8))}日のお店`}>
          <h3>{`${Number(picked.slice(5, 7))}月${Number(picked.slice(8))}日に行ったお店`}</h3>
          {dayList.map((v) => (
            <div key={`${v.shopId}-${v.at}`} className="rcal__item">
              {photoOf(v) && (
                <span className="rcal__thumb">
                  <img src={photoOf(v)!} alt="" />
                </span>
              )}
              <div className="rcal__item-main">
                <b>{v.name}</b>
                <span>
                  {time(v.at)}・{KIND_LABEL[v.kind]}
                  {mine.has(v.checkinId ?? '') && <i className="rc__stars">{'★'.repeat(mine.get(v.checkinId ?? '')?.stars ?? 0)}</i>}
                </span>
              </div>
            </div>
          ))}
          <button type="button" className="rcal__open" onClick={() => onOpenDay(picked)}>この日の地図を見る</button>
        </div>
      )}
      {!picked && <p className="rcal__note">写真のある日を押すと、その日に行ったお店が見られます</p>}
    </section>
  )
}
