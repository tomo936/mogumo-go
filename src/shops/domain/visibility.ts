import { MAX_SHOPS, SHOP_RADIUS_M } from '../config.ts'
import { isClearedAt } from '../../fog/domain/clearing.ts'
import type { Cleared } from '../../fog/domain/clearing.ts'
import { distanceMeters } from '../../map/domain/geo.ts'
import type { LatLng } from '../../map/domain/geo.ts'
import type { Shop } from './shop.ts'

// 3D のお店を出す対象: 1km 以内・晴れたセルにある・近い順に最大 MAX_SHOPS 軒
export function visibleShops(shops: Shop[], me: LatLng, cleared: Cleared): Shop[] {
  return shops
    .map((shop) => ({ shop, d: distanceMeters(me, shop) }))
    .filter(({ shop, d }) => d <= SHOP_RADIUS_M && isClearedAt(cleared, shop))
    .sort((a, b) => a.d - b.d)
    .slice(0, MAX_SHOPS)
    .map(({ shop }) => shop)
}
