import { ROTATE_DEG_PER_PX } from './config.ts'

// 1本指の横なぞり（dxPx）で地図の向きを回す。0〜360 に収める
export function nextBearing(bearing: number, dxPx: number): number {
  const b = (bearing + dxPx * ROTATE_DEG_PER_PX) % 360
  return b < 0 ? b + 360 : b
}
