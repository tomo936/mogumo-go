// 週ミッションの純粋な計算（Deno でも Vitest でも動く。外の世界に触れない）。
// 設計: docs/superpowers/specs/2026-11-10-weekly-missions-design.md（§3 数え方・§4.1 抽選・§9 変更）
import { kindFromHotpepper, kindFromMap } from './kind.ts'
import type { ShopKind } from './kind.ts'

export type Difficulty = 'easy' | 'normal' | 'hard'
export type Family = 'hint' | 'pioneer' | 'genre' | 'regular' | 'far' | 'variety' | 'time' | 'fog' | 'hashigo'
export type ConditionType =
  | 'hint_shop' | 'first_visit' | 'genre' | 'revisit' | 'far_from_home' | 'distinct_kinds'
  | 'lunch' | 'fog_cells' | 'active_days' | 'hashigo_days' | 'weekend'

export const REWARD: Record<Difficulty, number> = { easy: 50, normal: 100, hard: 150 }
const DAY_MS = 86_400_000
const JST_MS = 9 * 3_600_000
const SNACK: ShopKind[] = ['cafe', 'cake', 'bakery']

// 出せるかの条件（minKind: その種類のお店がまわりに何軒要るか。snack: おやつの3種のどれか）
type Need = { minKind?: number; snack?: true; home?: true; minDaysLeft?: number; beforeSunday?: true }
export type Entry = { key: string; difficulty: Difficulty; family: Family; type: ConditionType; target: number; need?: Need }

// 種類の一覧（設計 §3 の表。町が要る「同じ町で2軒」は町のデータが育ってから）
export const CATALOG: Entry[] = [
  { key: 'hint_trail', difficulty: 'easy', family: 'hint', type: 'hint_shop', target: 1 },
  { key: 'hajimemashite', difficulty: 'easy', family: 'pioneer', type: 'first_visit', target: 1 },
  { key: 'genre_week', difficulty: 'easy', family: 'genre', type: 'genre', target: 1, need: { minKind: 1 } },
  { key: 'oyatsu', difficulty: 'easy', family: 'genre', type: 'genre', target: 1, need: { snack: true } },
  { key: 'mata', difficulty: 'easy', family: 'regular', type: 'revisit', target: 1 },
  { key: 'far2', difficulty: 'normal', family: 'far', type: 'far_from_home', target: 2, need: { home: true } },
  { key: 'kaitaku', difficulty: 'normal', family: 'pioneer', type: 'first_visit', target: 3 },
  { key: 'meguri', difficulty: 'normal', family: 'genre', type: 'genre', target: 2, need: { minKind: 2 } },
  { key: 'sanshoku', difficulty: 'normal', family: 'variety', type: 'distinct_kinds', target: 3 },
  { key: 'hint_hunter', difficulty: 'normal', family: 'hint', type: 'hint_shop', target: 2 },
  { key: 'lunch', difficulty: 'normal', family: 'time', type: 'lunch', target: 3 },
  { key: 'harema', difficulty: 'normal', family: 'fog', type: 'fog_cells', target: 400 },
  { key: 'daikaitaku', difficulty: 'hard', family: 'pioneer', type: 'first_visit', target: 5 },
  { key: 'far4', difficulty: 'hard', family: 'far', type: 'far_from_home', target: 4, need: { home: true } },
  { key: 'itsutsu', difficulty: 'hard', family: 'variety', type: 'distinct_kinds', target: 5 },
  { key: 'hint_master', difficulty: 'hard', family: 'hint', type: 'hint_shop', target: 3 },
  { key: 'mainichi', difficulty: 'hard', family: 'time', type: 'active_days', target: 4, need: { minDaysLeft: 4 } },
  { key: 'hashigo', difficulty: 'hard', family: 'hashigo', type: 'hashigo_days', target: 2, need: { minDaysLeft: 2 } },
  { key: 'weekend', difficulty: 'hard', family: 'time', type: 'weekend', target: 3, need: { beforeSunday: true } },
]
// 候補が尽きたときでも必ず出せるもの（どこでも・いつでも達成できる）
const ALWAYS = new Set(['hint_trail', 'hajimemashite', 'mata', 'kaitaku', 'sanshoku', 'hint_hunter', 'daikaitaku', 'itsutsu', 'hint_master'])

// 日本時間の日付（YYYY-MM-DD）と曜日（0=日）
const jst = (ms: number) => new Date(ms + JST_MS)
export const jstDay = (ms: number) => jst(ms).toISOString().slice(0, 10)
const jstWeekday = (ms: number) => jst(ms).getUTCDay()

// その時刻が入る週の月曜（日本時間の日付）
export function weekStart(nowMs: number): string {
  const back = (jstWeekday(nowMs) + 6) % 7 // 月曜から何日目か
  return jstDay(nowMs - back * DAY_MS)
}
// 週の始まり・終わり（次の月曜 0 時 JST）の時刻
export const weekStartMs = (week: string) => Date.parse(`${week}T00:00:00+09:00`)
export const weekEndMs = (week: string) => weekStartMs(week) + 7 * DAY_MS
export const weekLastDay = (week: string) => jstDay(weekEndMs(week) - 1)
// 今日を含めて日曜までの日数（月曜 = 7）
export const daysLeft = (nowMs: number) => 7 - ((jstWeekday(nowMs) + 6) % 7)

export type Draft = { key: string; difficulty: Difficulty; family: Family; type: ConditionType; target: number; reward: number; kinds: ShopKind[] }
export type DrawInput = { kinds: Partial<Record<ShopKind, number>>; hasHome: boolean; nowMs: number }

const pick = <T>(xs: readonly T[], random: () => number): T => xs[Math.min(xs.length - 1, Math.floor(random() * xs.length))]

// まわりの種類（mystery を除く・軒数が min 以上）
const kindsWith = (kinds: DrawInput['kinds'], min: number): ShopKind[] =>
  (Object.entries(kinds) as [ShopKind, number][]).filter(([k, n]) => k !== 'mystery' && Number.isInteger(n) && n >= min).map(([k]) => k).sort()

function allowed(e: Entry, i: DrawInput): boolean {
  const n = e.need
  if (!n) return true
  if (n.home && !i.hasHome) return false
  if (n.minKind && kindsWith(i.kinds, n.minKind).length === 0) return false
  if (n.snack && !SNACK.some((k) => (i.kinds[k] ?? 0) >= 1)) return false
  if (n.minDaysLeft && daysLeft(i.nowMs) < n.minDaysLeft) return false
  if (n.beforeSunday && jstWeekday(i.nowMs) === 0) return false
  return true
}

// 3つ選ぶ。むずかしい → ふつう → かんたん の順（むずかしいの系が一番少ないので先に決める）。系は重ねない
export function drawMissions(i: DrawInput, random: () => number): Draft[] {
  const used = new Set<Family>()
  const out: Draft[] = []
  for (const d of ['hard', 'normal', 'easy'] as const) {
    const ofLevel = CATALOG.filter((e) => e.difficulty === d && !used.has(e.family))
    let pool = ofLevel.filter((e) => allowed(e, i))
    if (pool.length === 0) pool = ofLevel.filter((e) => ALWAYS.has(e.key))
    const e = pick(pool, random)
    used.add(e.family)
    let kinds: ShopKind[] = []
    if (e.key === 'oyatsu') kinds = [...SNACK]
    else if (e.need?.minKind) kinds = [pick(kindsWith(i.kinds, e.need.minKind), random)]
    out.push({ key: e.key, difficulty: d, family: e.family, type: e.type, target: e.target, reward: REWARD[d], kinds })
  }
  const order: Difficulty[] = ['easy', 'normal', 'hard']
  return out.sort((a, b) => order.indexOf(a.difficulty) - order.indexOf(b.difficulty))
}

// ---- 進みの数え方 ----
export type Visit = { shopId: string; at: number; wasHint: boolean; far: boolean; genreCode: string | null; genreName: string | null; name: string }
export type MissionRow = { type: ConditionType; target: number; kinds: ShopKind[]; createdAt: number }

// 店の種類（地図の店は分類＋店名、ホットペッパーの店はジャンルコード＋店名）
export const kindOf = (v: Pick<Visit, 'shopId' | 'genreCode' | 'genreName' | 'name'>): ShopKind =>
  v.shopId.startsWith('osm:') && v.genreName ? kindFromMap(v.genreName, v.name) : kindFromHotpepper(v.genreCode, v.name)

const hourJst = (ms: number) => jst(ms).getUTCHours()

// visits: 本人のチェックイン（期間の前も含めてよい。並びは問わない）。fogCells: 期間内にチェックインで晴れたマスの数
export function countProgress(m: MissionRow, week: string, visits: readonly Visit[], fogCells: number): number {
  const end = weekEndMs(week)
  const from = Math.max(m.createdAt, weekStartMs(week))
  const sorted = [...visits].sort((a, b) => a.at - b.at)
  const inside = sorted.filter((v) => v.at >= from && v.at < end)
  const before = (v: Visit) => sorted.some((w) => w.shopId === v.shopId && w.at < v.at)
  const days = (xs: Visit[]) => {
    const c = new Map<string, number>()
    for (const v of xs) c.set(jstDay(v.at), (c.get(jstDay(v.at)) ?? 0) + 1)
    return c
  }
  let n = 0
  switch (m.type) {
    case 'hint_shop': n = inside.filter((v) => v.wasHint).length; break
    case 'first_visit': n = inside.filter((v) => !before(v)).length; break
    case 'revisit': n = inside.filter((v) => before(v)).length; break
    case 'genre': n = inside.filter((v) => m.kinds.includes(kindOf(v))).length; break
    case 'far_from_home': n = inside.filter((v) => v.far).length; break
    case 'distinct_kinds': n = new Set(inside.map(kindOf).filter((k) => k !== 'mystery')).size; break
    case 'lunch': n = inside.filter((v) => hourJst(v.at) >= 11 && hourJst(v.at) < 14).length; break
    case 'fog_cells': n = fogCells; break
    case 'active_days': n = days(inside).size; break
    case 'hashigo_days': n = [...days(inside).values()].filter((c) => c >= 2).length; break
    case 'weekend': n = inside.filter((v) => jstWeekday(v.at) === 0 || jstWeekday(v.at) === 6).length; break
  }
  return Math.max(0, Math.min(m.target, n))
}

// 端末から来た「まわりの種類と軒数」を読む（知らない種類・数でないものは捨てる）
const KINDS: ShopKind[] = ['ramen', 'sushi', 'soba', 'washoku', 'izakaya', 'chinese', 'yakiniku', 'western', 'curry', 'cafe', 'cake', 'bakery', 'mystery', 'donburi', 'burger', 'ethnic', 'okonomiyaki', 'takoyaki']
export function parseDraw(v: unknown): { kinds: Partial<Record<ShopKind, number>>; hasHome: boolean } | null {
  if (typeof v !== 'object' || v === null) return null
  const o = v as { kinds?: unknown; has_home?: unknown }
  const kinds: Partial<Record<ShopKind, number>> = {}
  if (typeof o.kinds === 'object' && o.kinds !== null) {
    for (const k of KINDS) {
      const n = (o.kinds as Record<string, unknown>)[k]
      if (typeof n === 'number' && Number.isInteger(n) && n > 0 && n < 100000) kinds[k] = n
    }
  }
  return { kinds, hasHome: o.has_home === true }
}
