// 記録の地図に出す「行ったお店」のピンの計算。スライダーの日（日本時間）に行ったお店は大きく番号つき、
// それより前の日のお店は小さく出す（1店1つ）。‹ › は行った日から行った日へ跳ぶ。
import type { ShopKind } from '../../shops/domain/shop.ts'
import { jstDay } from '../../checkin/domain/day.ts'
import { stepWeek, type VisitEntry } from './timeline.ts'

export type DayPin = {
  shopId: string
  name: string
  kind: ShopKind
  lat: number
  lng: number
  today: boolean // スライダーの日に行った
  order: number | null // その日に回った順（1 から）。今日でなければ null
  lastDay: string // 最後に行った日（t まで）
}

const byTime = (a: VisitEntry, b: VisitEntry) => a.at - b.at

// t の日（日本時間）に行ったお店（時刻順）
export function visitsOnDay(visits: VisitEntry[], t: number): VisitEntry[] {
  const day = jstDay(new Date(t))
  return visits.filter((x) => x.day === day).sort(byTime)
}

export function pinsAt(visits: VisitEntry[], t: number): DayPin[] {
  const day = jstDay(new Date(t))
  const order = new Map<string, number>()
  for (const x of visitsOnDay(visits, t)) if (!order.has(x.shopId)) order.set(x.shopId, order.size + 1)
  const pins = new Map<string, DayPin>()
  for (const x of [...visits].sort(byTime)) {
    if (x.day > day || x.lat === null || x.lng === null) continue
    const n = order.get(x.shopId) ?? null
    pins.set(x.shopId, { shopId: x.shopId, name: x.name, kind: x.kind, lat: x.lat, lng: x.lng, today: n !== null, order: n, lastDay: x.day })
  }
  return [...pins.values()]
}

// t の日より後（前）で、行った日のうちいちばん近い日の「その日の最後の訪問の時刻」。無ければ t のまま
export function stepVisitDay(t: number, dir: 1 | -1, visits: VisitEntry[], range: { start: number; end: number }): number {
  if (visits.length === 0) return stepWeek(t, dir, range)
  const day = jstDay(new Date(t))
  const lastOf = new Map<string, number>()
  for (const x of visits) lastOf.set(x.day, Math.max(lastOf.get(x.day) ?? -Infinity, x.at))
  const days = [...lastOf.keys()].sort()
  const next = dir === 1 ? days.find((d) => d > day) : days.filter((d) => d < day).pop()
  if (next === undefined) return t
  return Math.min(range.end, Math.max(range.start, lastOf.get(next) as number))
}
