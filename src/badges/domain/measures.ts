// 実績の数え方の部品。どれも「今の数（have）」と「取れた時刻（at）」を返す。
import { distanceMeters } from '../../map/domain/geo.ts'
import type { ShopKind } from '../../shops/domain/shop.ts'
import type { Measure, Prepared, PreparedVisit } from './types.ts'

type Pick = (v: PreparedVisit) => boolean

// 時刻の列（古い順）の need 番目で取れる
export const nth = (times: number[], need: number): Measure => ({ have: times.length, at: times[need - 1] ?? null })

// 条件に合う訪問の回数
export const countWhere = (pick: Pick) => (p: Prepared, need: number): Measure => nth(p.visits.filter(pick).map((v) => v.at), need)

// まとまり（同じ店・同じ日 など）ごとに数え、どれか1つが need に届いたらその時刻。have はいちばん多いまとまり
export const groupReach = (key: (v: PreparedVisit) => string, pick: Pick = () => true) => (p: Prepared, need: number): Measure => {
  const groups = new Map<string, number[]>()
  for (const v of p.visits) if (pick(v)) groups.set(key(v), [...(groups.get(key(v)) ?? []), v.at])
  let have = 0
  let at: number | null = null
  for (const times of groups.values()) {
    have = Math.max(have, times.length)
    const t = times[need - 1]
    if (t !== undefined && (at === null || t < at)) at = t
  }
  return { have, at }
}

// 初めて出た「もの」（店・種類 など）の時刻の列
const firstTimes = (p: Prepared, key: (v: PreparedVisit) => string, pick: Pick = () => true): number[] => {
  const seen = new Set<string>()
  const out: number[] = []
  for (const v of p.visits) {
    if (!pick(v) || seen.has(key(v))) continue
    seen.add(key(v))
    out.push(v.at)
  }
  return out
}
export const distinctCount = (key: (v: PreparedVisit) => string, pick?: Pick) => (p: Prepared, need: number): Measure => nth(firstTimes(p, key, pick), need)

// まとまりの中で、ちがう「もの」が need 種類になった時刻（いちばん早いまとまり）
export const distinctInGroup = (group: (v: PreparedVisit) => string, key: (v: PreparedVisit) => string | null) => (p: Prepared, need: number): Measure => {
  const groups = new Map<string, PreparedVisit[]>()
  for (const v of p.visits) groups.set(group(v), [...(groups.get(group(v)) ?? []), v])
  let have = 0
  let at: number | null = null
  for (const list of groups.values()) {
    const seen = new Set<string>()
    for (const v of list) {
      const k = key(v)
      if (k === null || seen.has(k)) continue
      seen.add(k)
      if (seen.size === need && (at === null || v.at < at)) at = v.at
    }
    have = Math.max(have, seen.size)
  }
  return { have, at }
}

// 同じ店が need 回になった店の数（行きつけ）。each = その店の回数
export const shopsReaching = (each: number) => (p: Prepared, need: number): Measure => {
  const counts = new Map<string, number>()
  const times: number[] = []
  for (const v of p.visits) {
    const c = (counts.get(v.shopId) ?? 0) + 1
    counts.set(v.shopId, c)
    if (c === each) times.push(v.at)
  }
  return nth(times, need)
}

// 晴れた広さ（km²）。1マス = 25m × 25m
const CELL_KM2 = 0.000625
export const fogArea = (p: Prepared, needKm2: number): Measure => {
  const cells = Math.ceil(needKm2 / CELL_KM2 - 1e-9)
  return { have: Math.round(p.cellTimes.length * CELL_KM2 * 100) / 100, at: p.cellTimes[cells - 1] ?? null }
}

// 自宅からの距離（km）。have はいちばん遠いお店（小数1けた）
export const farFromHome = (p: Prepared, needKm: number): Measure => {
  const home = p.home
  if (!home) return { have: null, at: null }
  let max = 0
  let at: number | null = null
  for (const v of p.visits) {
    if (v.lat === null || v.lng === null) continue
    const km = distanceMeters(home, { lat: v.lat, lng: v.lng }) / 1000
    max = Math.max(max, km)
    if (at === null && km >= needKm) at = v.at
  }
  return { have: Math.floor(max * 10) / 10, at }
}

// 自宅から 1km 以上先のお店を、北・東・南・西のどの向きで行ったか（45° ずつ区切る）
export const directions = (p: Prepared, need: number): Measure => {
  const home = p.home
  if (!home) return { have: null, at: null }
  const seen = new Set<number>()
  let at: number | null = null
  for (const v of p.visits) {
    if (v.lat === null || v.lng === null) continue
    if (distanceMeters(home, { lat: v.lat, lng: v.lng }) < 1000) continue
    const dy = v.lat - home.lat
    const dx = (v.lng - home.lng) * Math.cos((home.lat * Math.PI) / 180)
    const deg = ((Math.atan2(dx, dy) * 180) / Math.PI + 360) % 360 // 北 0・東 90
    seen.add(Math.round(deg / 90) % 4)
    if (seen.size === need && at === null) at = v.at
  }
  return { have: seen.size, at }
}

const nextDay = (day: string): string => {
  const d = new Date(`${day}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}

// 続けて行った日数。key ごと（店ごと など）にも数えられる
export const streak = (key: (v: PreparedVisit) => string = () => '') => (p: Prepared, need: number): Measure => {
  const groups = new Map<string, PreparedVisit[]>()
  for (const v of p.visits) groups.set(key(v), [...(groups.get(key(v)) ?? []), v])
  let have = 0
  let at: number | null = null
  for (const list of groups.values()) {
    let run = 0
    let last: string | null = null
    for (const v of list) {
      if (v.day === last) continue
      run = last !== null && nextDay(last) === v.day ? run + 1 : 1
      last = v.day
      have = Math.max(have, run)
      if (run === need && (at === null || v.at < at)) at = v.at
    }
  }
  return { have, at }
}

// 1つだけの実績: 条件に合う最初の訪問
export const firstWhere = (pick: Pick) => (p: Prepared): Measure => ({ have: null, at: p.visits.find(pick)?.at ?? null })

// 同じ日に、条件のまとまりがすべてそろった時刻
export const sameDayAll = (sets: ShopKind[][]) => (p: Prepared, need: number): Measure =>
  distinctInGroup((v) => v.day, (v) => {
    const i = sets.findIndex((s) => s.includes(v.kind))
    return i < 0 ? null : String(i)
  })(p, need)

// はじめての訪問から365日以上たってからの訪問
export const anniversary = (p: Prepared): Measure => {
  const first = p.visits[0]
  if (!first) return { have: null, at: null }
  return { have: null, at: p.visits.find((v) => v.at - first.at >= 365 * 86_400_000)?.at ?? null }
}
