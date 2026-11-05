import { FOLLOW_TAU_MS, MAX_ACCURACY_M, MAX_SPEED_MPS, SNAP_GAP_MS } from './config.ts'
import { distanceMeters } from './geo.ts'
import type { LatLng } from './geo.ts'

export type Fix = { lat: number; lng: number; accuracy: number; time: number }

// 新しい測位を、最後に受け入れた測位と比べて「使う／捨てる／一気に移す」に分ける
export function judgeFix(fix: Fix, last: Fix | null): 'accept' | 'reject' | 'snap' {
  if (fix.accuracy > MAX_ACCURACY_M) return 'reject'
  if (!last) return 'snap'
  const gap = fix.time - last.time
  if (gap >= SNAP_GAP_MS) return 'snap'
  const speed = distanceMeters(last, fix) / Math.max(gap, 1) * 1000
  return speed > MAX_SPEED_MPS ? 'reject' : 'accept'
}

// 表示位置を目標へ寄せる。コマの間隔が変わっても同じ速さで寄る（指数的な追従）
export function stepToward(current: LatLng, target: LatLng, dtMs: number): LatLng {
  const k = 1 - Math.exp(-Math.max(dtMs, 0) / FOLLOW_TAU_MS)
  return {
    lat: current.lat + (target.lat - current.lat) * k,
    lng: current.lng + (target.lng - current.lng) * k,
  }
}
