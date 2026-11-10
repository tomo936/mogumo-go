// 気配のシートに出す文（方角・入れかわりまでの時間・ジャンル名からの料理の種類）。純粋な計算。
import type { LatLng } from '../../map/domain/geo.ts'
import { kindFromHotpepper } from '../../shops/domain/kind.ts'
import type { ShopKind } from '../../shops/domain/shop.ts'

const DIRS = ['北', '北東', '東', '南東', '南', '南西', '西', '北西']

// from から to への向き（8方位）。真上・すぐ近く（15m 未満）は null
export function directionName(from: LatLng, to: LatLng): string | null {
  const dy = to.lat - from.lat
  const dx = (to.lng - from.lng) * Math.cos((from.lat * Math.PI) / 180)
  if (Math.hypot(dx, dy) * 111_320 < 15) return null
  const deg = ((Math.atan2(dx, dy) * 180) / Math.PI + 360) % 360 // 北 0・東 90
  return DIRS[Math.round(deg / 45) % 8]
}

// 気配が入れかわる（日本時間の0時）までの時間。1時間未満は「まもなく」
export function untilResetLabel(now: Date): string {
  const jst = new Date(now.getTime() + 9 * 3600_000)
  const left = 24 * 60 - (jst.getUTCHours() * 60 + jst.getUTCMinutes())
  return left < 60 ? 'まもなく' : `${Math.floor(left / 60)}時間`
}

// 気配のジャンル名（ホットペッパーの名前）から料理の絵の種類を推す。分からなければ mystery
export function kindFromGenre(genre: string | null): ShopKind {
  return genre ? kindFromHotpepper(null, genre) : 'mystery'
}
