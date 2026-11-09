// 図鑑の並べ方・ページ分け・埋まり数（純粋な計算）。仕様: docs/superpowers/specs/2026-11-10-zukan-design.md
import type { ShopKind } from '../../shops/domain/shop.ts'
import type { Visits } from '../../checkin/domain/visits.ts'
import type { Shop } from '../../shops/domain/shop.ts'

export type ZukanShop = {
  id: string
  name: string
  kind: ShopKind
  photoUrl: string | null
  catch: string | null
  genreName: string | null
  lat: number
  lng: number
  visits: Visits | null // null = まだ行っていない（「？」）
  cleared: boolean // 晴れた場所（霧が晴れている所）にあるか
  mapId?: string | null // 合体前の地図の点（osm:…）。記録をまとめるときに使う
}

export const PAGE_SIZE = 4 // 2列×2段（ポラロイド風の大きいカード）

// ジャンルの並び（図鑑のページの順）
export const KIND_ORDER: ShopKind[] = [
  'ramen', 'sushi', 'soba', 'washoku', 'izakaya', 'chinese', 'yakiniku', 'western', 'curry',
  'cafe', 'cake', 'bakery', 'donburi', 'burger', 'ethnic', 'okonomiyaki', 'takoyaki', 'mystery',
]

// 同じ店が hp: と osm: の2つの id で出たら1枚にまとめ、記録を合わせる
function mergeSame(shops: ZukanShop[]): ZukanShop[] {
  const byId = new Map(shops.map((s) => [s.id, s]))
  const out: ZukanShop[] = []
  const seen = new Set<string>()
  for (const s of shops) {
    if (seen.has(s.id)) continue
    seen.add(s.id)
    const twin = s.mapId ? byId.get(s.mapId) : undefined
    if (!twin || seen.has(twin.id)) {
      out.push(s)
      continue
    }
    seen.add(twin.id)
    const a = s.visits
    const b = twin.visits
    const visits: Visits | null = a && b
      ? { count: a.count + b.count, firstDay: a.firstDay < b.firstDay ? a.firstDay : b.firstDay, lastDay: a.lastDay > b.lastDay ? a.lastDay : b.lastDay }
      : (a ?? b)
    out.push({ ...s, visits })
  }
  return out
}

// 行った店（最近行った順）が先、「？」の店（id 順）が後ろ
function order(a: ZukanShop, b: ZukanShop): number {
  if (a.visits && b.visits) return b.visits.lastDay.localeCompare(a.visits.lastDay) || a.id.localeCompare(b.id)
  if (a.visits) return -1
  if (b.visits) return 1
  return a.id.localeCompare(b.id)
}

// 出すお店: 晴れた場所のお店は全部（行っていなければ「？」）。霧の中のお店は、行ったことがあるものだけ
export const shownInZukan = (s: ZukanShop): boolean => s.cleared || s.visits !== null

export function buildZukan(shops: ZukanShop[]): Map<ShopKind, ZukanShop[]> {
  const out = new Map<ShopKind, ZukanShop[]>()
  for (const k of KIND_ORDER) out.set(k, [])
  for (const s of mergeSame(shops).filter(shownInZukan)) out.get(s.kind)?.push(s)
  for (const list of out.values()) list.sort(order)
  return out
}

export function pageCount(n: number): number {
  return Math.ceil(n / PAGE_SIZE)
}

export function filledCount(cards: ZukanShop[]): number {
  return cards.filter((c) => c.visits !== null).length
}

// 図鑑の店を、お店のシートに渡す形に直す（営業時間は shops に無いので出さない）
export function zukanToShop(z: ZukanShop): Shop {
  return {
    id: z.id,
    name: z.name,
    lat: z.lat,
    lng: z.lng,
    kind: z.kind,
    details: { genreCode: null, genreName: z.genreName, catch: z.catch, budgetName: null, photoUrl: z.photoUrl, open: null },
    mapId: null,
  }
}
