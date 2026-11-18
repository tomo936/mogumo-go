import { AVATAR_SPEED_TAU_MS, AVATAR_WALK_SPEED_MPS } from '../config.ts'
import type { LatLng } from './geo.ts'
import { localFrame } from './geo.ts'

// 自分のアバター（お試し版）の向きと歩き判定。画面の上＝back、下＝front、右＝right
export type Facing = 'back' | 'back-right' | 'right' | 'front-right' | 'front' | 'front-left' | 'left' | 'back-left'

const FACINGS: readonly Facing[] = ['back', 'back-right', 'right', 'front-right', 'front', 'front-left', 'left', 'back-left']

// from → to の方位（北が 0、東が 90、0〜360）
export function bearingDeg(from: LatLng, to: LatLng): number {
  const p = localFrame(from).to(to)
  const d = (Math.atan2(p.x, p.y) * 180) / Math.PI
  return d < 0 ? d + 360 : d
}

// 進む方位から地図の回転を引いた「画面上の向き」で 8 方向を選ぶ
export function facingFor(travelBearing: number, mapBearing: number): Facing {
  const screen = (((travelBearing - mapBearing) % 360) + 360) % 360
  return FACINGS[Math.round(screen / 45) % 8]!
}

// 速さ（m/秒）をなめらかにする。distM は今回の1コマで動いた距離
export function smoothSpeed(prev: number, distM: number, dtMs: number): number {
  if (dtMs <= 0) return prev
  const k = 1 - Math.exp(-dtMs / AVATAR_SPEED_TAU_MS)
  return prev + (distM / (dtMs / 1000) - prev) * k
}

export function isWalking(speedMps: number): boolean {
  return speedMps > AVATAR_WALK_SPEED_MPS
}
