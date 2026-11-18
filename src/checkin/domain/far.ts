// 自宅から 500m 以上離れているか（遠出ボーナスの判定。自宅が無ければ false）
import { distanceMeters } from '../../map/domain/geo.ts'
import type { LatLng } from '../../map/domain/geo.ts'

export const FAR_FROM_HOME_M = 500

export function farFromHome(home: LatLng | null, me: LatLng): boolean {
  return home !== null && distanceMeters(home, me) >= FAR_FROM_HOME_M
}
