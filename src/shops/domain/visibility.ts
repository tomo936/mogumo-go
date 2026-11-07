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
