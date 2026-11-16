import { distanceMeters } from '../../map/domain/geo.ts'
import type { LatLng } from '../../map/domain/geo.ts'

// 貯めておく地図のお店・ホットペッパーのお店を、いくつかの中心のどれかから radiusM 以内のものだけ残す。
// 中心は「見ている場所」と「自分」の両方（見ている場所だけにすると、遠くを見て戻ったとき自分のまわりのお店が消える。
// 2026-11-17 オーナー「図鑑から北沢のお店へ行って戻ったらお店が減った」。実測 165 → 149 軒）。
// 中心が 1 つも無い（位置がまだ分からない）ときは全部残す
export function retainNear<T extends LatLng>(items: readonly T[], centers: readonly (LatLng | null)[], radiusM: number): T[] {
  const cs = centers.filter((c): c is LatLng => c !== null)
  if (cs.length === 0) return [...items]
  return items.filter((it) => cs.some((c) => distanceMeters(c, it) <= radiusM))
}
