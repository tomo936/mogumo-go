// 近くのお店の一覧（A11）。地図から開く、徒歩圏内のお店を近い順に出す。
// 仕様: docs/superpowers/specs/2026-11-16-nearby-list-design.md
import { isClearedAt } from '../../fog/domain/clearing.ts'
import type { Cleared } from '../../fog/domain/clearing.ts'
import { distanceMeters } from '../../map/domain/geo.ts'
import type { LatLng } from '../../map/domain/geo.ts'
import { IN_FOG_VISIBLE_M } from '../../shops/config.ts'
import type { Shop, ShopKind } from '../../shops/domain/shop.ts'

export const WALK_RADIUS_M = 800 // 徒歩圏内（歩いて約 10 分）。オーナー 2026-11-16「晴らした人が無限に出てくるから徒歩圏内に」

export type NearbyShop = { shop: Shop; distanceM: number }

// me: 今いる場所（地図が離れた所を見ていても、自分から測る）。kind: null は全部。
// 出すのは晴れた場所のお店と、霧の中でも 50m 以内のお店（S1）。hiddenIds: 正体を伏せたままの気配の店（名前が分かってしまうので出さない）
export function nearbyShops(shops: readonly Shop[], me: LatLng, cleared: Cleared, kind: ShopKind | null, hiddenIds: ReadonlySet<string> = new Set()): NearbyShop[] {
  return shops
    .filter((s) => !hiddenIds.has(s.id) && (kind === null || s.kind === kind))
    .map((shop) => ({ shop, distanceM: distanceMeters(me, shop) }))
    .filter(({ shop, distanceM }) => distanceM <= WALK_RADIUS_M && (isClearedAt(cleared, shop) || distanceM <= IN_FOG_VISIBLE_M))
    .sort((a, b) => a.distanceM - b.distanceM)
}

// ジャンルの絞り込みの札: 数の多い順（同数は近い順に最初に出た順）。絞り込む前の一覧から数える
export function kindsIn(list: readonly NearbyShop[]): [ShopKind, number][] {
  const count = new Map<ShopKind, number>()
  for (const { shop } of list) count.set(shop.kind, (count.get(shop.kind) ?? 0) + 1)
  return [...count.entries()].sort((a, b) => b[1] - a[1])
}
