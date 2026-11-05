import { FIRST_FIX_MAX_ACCURACY_M, FOLLOW_TAU_MS, MAX_ACCURACY_M, MAX_SPEED_MPS, SNAP_GAP_MS } from './config.ts'
import { distanceMeters } from './geo.ts'
import type { LatLng } from './geo.ts'

export type Fix = { lat: number; lng: number; accuracy: number; time: number }

// 新しい測位を、最後に受け入れた測位と比べて「使う／捨てる／一気に移す」に分ける
export function judgeFix(fix: Fix, last: Fix | null): 'accept' | 'reject' | 'snap' {
  if (!last) return fix.accuracy > FIRST_FIX_MAX_ACCURACY_M ? 'reject' : 'snap'
  if (fix.accuracy > MAX_ACCURACY_M) return 'reject'
  const gap = fix.time - last.time
  if (gap >= SNAP_GAP_MS) return 'snap'
  // 2つの測位の誤差の範囲内のずれは「飛び」とみなさない
  const moved = Math.max(0, distanceMeters(last, fix) - last.accuracy - fix.accuracy)
  const speed = moved / Math.max(gap, 1) * 1000
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

// 「途切れ」とみなすか。最後に受け入れたあとに捨てた測位があり（＝精度の悪い測位が届き続けている）、
// 受け入れから SNAP_GAP_MS たったときだけ。立ち止まって新しい測位が来ないだけなら途切れにしない
export function isStale(lastAcceptedAt: number, lastRejectedAt: number | null, now: number): boolean {
  if (lastRejectedAt === null || lastRejectedAt <= lastAcceptedAt) return false
  return now - lastAcceptedAt >= SNAP_GAP_MS
}

// カメラを動かすか。指で操作中（ピンチ・ズーム中）と、ほとんど動いていないコマは動かさない。
// MapLibre の jumpTo は指の操作をリセットするため、毎コマ呼ぶとピンチが効かなくなる
export function shouldMoveCamera(shown: LatLng | null, next: LatLng, gesturing: boolean): boolean {
  if (gesturing) return false
  return !shown || distanceMeters(shown, next) >= 0.01
}
