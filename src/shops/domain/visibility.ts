import { IN_FOG_VISIBLE_M, SHOP_RADIUS_M } from '../config.ts'
import { isClearedAt } from '../../fog/domain/clearing.ts'
import type { Cleared } from '../../fog/domain/clearing.ts'
import { distanceMeters } from '../../map/domain/geo.ts'
import type { LatLng } from '../../map/domain/geo.ts'
import type { Shop } from './shop.ts'

// 3D のお店を出す対象: 1km 以内で、晴れたセルにある（または霧の中でも 50m 以内）・近い順に全部（数の上限は模型の数で別にかける）
export function visibleShops(shops: Shop[], me: LatLng, cleared: Cleared): Shop[] {
  return shops
    .map((shop) => ({ shop, d: distanceMeters(me, shop) }))
    .filter(({ shop, d }) => d <= SHOP_RADIUS_M && (d <= IN_FOG_VISIBLE_M || isClearedAt(cleared, shop)))
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
