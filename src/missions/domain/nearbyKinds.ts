// 週ミッションの出題に送る「まわりのお店の種類と軒数」（位置は送らない）。範囲は気配と同じ。純粋な計算。
import { distanceMeters } from '../../map/domain/geo.ts'
import type { LatLng } from '../../map/domain/geo.ts'
import type { Shop, ShopKind } from '../../shops/domain/shop.ts'
import { HINT_AWAY_RADIUS_M, HINT_HOME_RADIUS_M } from '../../hints/config.ts'

// 自宅のそばにいれば自宅から 1km、自宅から遠ければ今いる場所から 1km（自宅なしも今いる場所）
export function nearbyKinds(shops: readonly Shop[], home: LatLng | null, me: LatLng | null): Partial<Record<ShopKind, number>> {
  const atHome = home !== null && (me === null || distanceMeters(home, me) <= HINT_HOME_RADIUS_M)
  const center = atHome ? home : me
  const radius = atHome ? HINT_HOME_RADIUS_M : HINT_AWAY_RADIUS_M
  const out: Partial<Record<ShopKind, number>> = {}
  if (!center) return out
  const seen = new Set<string>()
  for (const s of shops) {
    if (s.name === '' || s.kind === 'mystery') continue
    const id = s.mapId ?? s.id // 地図と合体した店を2回数えない
    if (seen.has(id)) continue
    if (distanceMeters(center, s) > radius) continue
    seen.add(id)
    out[s.kind] = (out[s.kind] ?? 0) + 1
  }
  return out
}
