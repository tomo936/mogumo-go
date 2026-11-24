import { IN_FOG_VISIBLE_M, SHOP_RADIUS_M } from '../config.ts'
import { isClearedAt } from '../../fog/domain/clearing.ts'
import type { Cleared } from '../../fog/domain/clearing.ts'
import { distanceMeters } from '../../map/domain/geo.ts'
import type { LatLng } from '../../map/domain/geo.ts'
import type { Shop } from './shop.ts'

// 3D のお店を出す対象: 1km 以内で、晴れたセルにある（または霧の中でも 50m 以内）・近い順に全部（数の上限は模型の数で別にかける）
// area: 出す範囲の真ん中（ふだんは自分、離れた所を見ているときはその場所）。me: 自分。霧の中の店は自分の近くだけ（仕様 S1）
export function visibleShops(shops: Shop[], area: LatLng, cleared: Cleared, me: LatLng = area): Shop[] {
  return shops
    .map((shop) => ({ shop, d: distanceMeters(area, shop) }))
    .filter(({ shop, d }) => d <= SHOP_RADIUS_M && (isClearedAt(cleared, shop) || distanceMeters(me, shop) <= IN_FOG_VISIBLE_M))
    .sort((a, b) => a.d - b.d)
    .map(({ shop }) => shop)
}

// 模型をどの層に出すか（模型の中心は店の点ではなく、輪郭に合わせた位置）。
// 'fog': 霧の中で IN_FOG_VISIBLE_M 以内の店がいる（今までどおり雲の上に描く）
// 'clear': 模型の中心が晴れたセル（雲と奥行きを比べて、手前の雲には隠れる）
// null: 店の点は晴れでも、模型の中心が霧のセル（雲の中に模型が立ってしまうので出さない）
export function modelPlace(center: LatLng, members: LatLng[], me: LatLng, cleared: Cleared): 'fog' | 'clear' | null {
  if (members.some((m) => !isClearedAt(cleared, m) && distanceMeters(me, m) <= IN_FOG_VISIBLE_M)) return 'fog'
  return isClearedAt(cleared, center) ? 'clear' : null
}

// 見ている所 from から to までの地面の間に、まだ晴れていない所があるか（霧の向こうか）。
// STEP_M ごとに調べる。両端の近く（from のまわり・to のお店のセル）は除く
const STEP_M = 20
export function behindFog(from: LatLng, to: LatLng, cleared: Cleared): boolean {
  const d = distanceMeters(from, to)
  const n = Math.floor(d / STEP_M)
  for (let i = 1; i < n; i++) {
    const t = (i * STEP_M) / d
    if (d - i * STEP_M < STEP_M) break // お店のすぐ手前（お店のセル）は見ない
    const p = { lat: from.lat + (to.lat - from.lat) * t, lng: from.lng + (to.lng - from.lng) * t }
    if (!isClearedAt(cleared, p)) return true
  }
  return false
}
