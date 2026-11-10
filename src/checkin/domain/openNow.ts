// ホットペッパーの営業時間の文から「いま営業中か」を出す。書き方が店ごとにばらばらなので、
// 読めたときだけ open / closed を返し、自信が無ければ unknown（画面は文をそのまま出す）。
// 祝日・祝前日は分からないので無視する（曜日だけで決める）。時刻は日本時間。
import { formatOpen } from './openHours.ts'

export type OpenNow = { state: 'open'; until: string } | { state: 'closed'; from: string | null } | { state: 'unknown' }

const DAYS = '月火水木金土日' // 月 = 0
type Range = { start: number; end: number } // 分。end は日またぎで 1440 をこえる

const clock = (m: number) => `${Math.floor((m % 1440) / 60)}:${String(m % 60).padStart(2, '0')}`

function parseDays(spec: string): number[] {
  const out = new Set<number>()
  for (const part of spec.split(/[、・,]/)) {
    const r = part.match(/([月火水木金土日])[～-]([月火水木金土日])/)
    if (r) {
      const a = DAYS.indexOf(r[1])
      const b = DAYS.indexOf(r[2])
      for (let i = a; ; i = (i + 1) % 7) {
        out.add(i)
        if (i === b) break
      }
      continue
    }
    for (const ch of part.replace(/祝[前後]?日?/g, '')) if (DAYS.includes(ch)) out.add(DAYS.indexOf(ch))
  }
  return [...out]
}

function parseRanges(text: string): Range[] {
  const out: Range[] = []
  for (const m of text.matchAll(/(翌)?(\d{1,2}):(\d{2})\s*～\s*(翌)?(\d{1,2}):(\d{2})/g)) {
    const start = Number(m[2]) * 60 + Number(m[3])
    let end = Number(m[5]) * 60 + Number(m[6])
    if (m[4] || end <= start) end += end < 1440 ? 1440 : 0
    if (start < 1440 && end > start) out.push({ start, end })
  }
  return out
}

// 曜日ごとの時間帯（曜日の書いていない文は毎日）
function schedule(raw: string): Map<number, Range[]> | null {
  const text = formatOpen(raw)
    .replace(/[〜~]/g, '～')
    .replace(/：/g, ':')
    .replace(/（[^）]*）|\([^)]*\)/g, ' ')
  const pieces = text.split(/([月火水木金土日祝前後、・～-]*[月火水木金土日祝][月火水木金土日祝前後、・～-]*)\s*:(?!\d)/)
  const week = new Map<number, Range[]>()
  if (pieces.length === 1) {
    const ranges = parseRanges(text)
    if (ranges.length === 0) return null
    for (let d = 0; d < 7; d++) week.set(d, ranges)
    return week
  }
  for (let i = 1; i < pieces.length; i += 2) {
    const ranges = parseRanges(pieces[i + 1] ?? '')
    for (const d of parseDays(pieces[i])) week.set(d, [...(week.get(d) ?? []), ...ranges])
  }
  return [...week.values()].some((r) => r.length > 0) ? week : null
}

export function openNow(raw: string, now: Date): OpenNow {
  const week = schedule(raw)
  if (!week) return { state: 'unknown' }
  const jst = new Date(now.getTime() + 9 * 3600_000)
  const day = (jst.getUTCDay() + 6) % 7 // 月 = 0
  const min = jst.getUTCHours() * 60 + jst.getUTCMinutes()
  const today = week.get(day) ?? []
  const yesterday = week.get((day + 6) % 7) ?? []
  for (const r of today) if (min >= r.start && min < r.end) return { state: 'open', until: clock(r.end) }
  for (const r of yesterday) if (r.end > 1440 && min + 1440 < r.end) return { state: 'open', until: clock(r.end) }
  const next = today.filter((r) => r.start > min).sort((a, b) => a.start - b.start)[0]
  return { state: 'closed', from: next ? clock(next.start) : null }
}
