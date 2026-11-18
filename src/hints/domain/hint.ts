// 気配の型と、画面に出す文の組み立て（純粋な計算）。
import { distanceMeters } from '../../map/domain/geo.ts'
import type { LatLng } from '../../map/domain/geo.ts'
import { MATCH_DISTANCE_M } from '../../shops/config.ts'
import { namesContain, normalizeName } from '../../shops/domain/merge.ts'
import type { Shop } from '../../shops/domain/shop.ts'
import { HINT_NONE_GUIDE_COUNT } from '../config.ts'

export type DailyHint = {
  id: string
  slot: number
  shopId: string
  genre: string | null
  catch: string | null
  budget: string | null
  isMystery: boolean
  completed: boolean
  shop: { name: string; lat: number; lng: number }
}

export type HintSet = {
  day: string
  generation: number
  regenLeft: 0 | 1
  hints: DailyHint[]
}

export const MYSTERY_TEXT = '正体は行ってみてのお楽しみ'

export function genreLabel(h: DailyHint): string {
  if (h.isMystery) return '謎の気配'
  return h.genre ? `${h.genre}？` : 'ジャンル？'
}

export function catchLabel(c: string | null): string | null {
  if (!c) return null
  return c.endsWith('…') ? `…${c}` : `…${c}…`
}

export function budgetLabel(b: string | null): string | null {
  return b ? `予算 ${b}` : null
}

export function hintLines(h: DailyHint): string[] {
  if (h.isMystery) return [MYSTERY_TEXT]
  return [genreLabel(h), catchLabel(h.catch), budgetLabel(h.budget)].filter((x): x is string => x !== null)
}

// 100m 未満は 10m 単位、以上は 50m 単位に四捨五入
export function roundDistance(m: number): number {
  const r = m < 100 ? Math.round(m / 10) * 10 : Math.round(m / 50) * 50
  return Math.max(10, r)
}

export function distanceLabel(m: number): string {
  return `ここから 約${roundDistance(m)}m`
}

type ShopRef = Pick<Shop, 'id' | 'mapId' | 'name' | 'lat' | 'lng'>

// 気配の店と同じ店か。id・mapId が同じ、または hp の気配と osm の店が 40m 以内で名前が互いを含む
// （ホットペッパーの読み込みに失敗して地図の店だけになった場合。サーバーの照合と同じ考え方）
export function matchesShop(h: DailyHint, s: ShopRef): boolean {
  if (s.id === h.shopId || s.mapId === h.shopId) return true
  if (!h.shopId.startsWith('hp:') || !s.id.startsWith('osm:')) return false
  if (distanceMeters(s, h.shop) > MATCH_DISTANCE_M) return false
  return namesContain(normalizeName(s.name), normalizeName(h.shop.name))
}

// 気配の店の位置。端末の店（地図の点）があればその位置、無ければ shops の位置
export function hintPosition(h: DailyHint, shops: readonly Shop[]): LatLng {
  const s = shops.find((x) => x.id === h.shopId || x.mapId === h.shopId)
  return s ? { lat: s.lat, lng: s.lng } : { lat: h.shop.lat, lng: h.shop.lng }
}

// 気配なしの日の案内: 名前あり・未訪問の店を近い順に
export function guideShops(near: readonly Shop[], checked: ReadonlySet<string>, me: LatLng, count = HINT_NONE_GUIDE_COUNT): Shop[] {
  return near
    .filter((s) => s.name !== '' && !checked.has(s.id) && !(s.mapId && checked.has(s.mapId)))
    .map((s) => ({ s, d: distanceMeters(me, s) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, count)
    .map((x) => x.s)
}
