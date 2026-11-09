// 気配を作ってよいか（速さ）と、「この辺りで探し直す」を出すかの判定。
import { distanceMeters } from '../../map/domain/geo.ts'
import type { LatLng } from '../../map/domain/geo.ts'
import { HINT_FAST_KMH, HINT_REGEN_MIN_M, HINT_SLOW_HOLD_MS, HINT_SPEED_MIN_SPAN_MS, HINT_SPEED_WINDOW_MS } from '../config.ts'
import type { HintSet } from './hint.ts'

export type Sample = { p: LatLng; t: number } // t はミリ秒
export type SpeedGate = { samples: Sample[]; lastFastAt: number | null }
export const emptyGate: SpeedGate = { samples: [], lastFastAt: null }

// 位置を1点足す。窓の外の点を捨て、窓の最初と最後から速さを出す。測れない（幅が短い）ときは遅いとみなす
export function pushSample(g: SpeedGate, s: Sample): SpeedGate {
  const samples = [...g.samples, s].filter((x) => s.t - x.t <= HINT_SPEED_WINDOW_MS)
  const first = samples[0]
  const span = s.t - first.t
  let lastFastAt = g.lastFastAt
  if (span >= HINT_SPEED_MIN_SPAN_MS) {
    const kmh = (distanceMeters(first.p, s.p) / (span / 1000)) * 3.6
    if (kmh > HINT_FAST_KMH) lastFastAt = s.t
  }
  return { samples, lastFastAt }
}

export function mayGenerate(g: SpeedGate, now: number): boolean {
  return g.lastFastAt === null || now - g.lastFastAt >= HINT_SLOW_HOLD_MS
}

// 今の組の重心
export function hintCentroid(set: HintSet): LatLng {
  const n = set.hints.length
  return {
    lat: set.hints.reduce((a, h) => a + h.shop.lat, 0) / n,
    lng: set.hints.reduce((a, h) => a + h.shop.lng, 0) / n,
  }
}

export function showRegen(set: HintSet | null, me: LatLng | null): boolean {
  if (!set || !me || set.hints.length === 0) return false
  if (set.regenLeft !== 1) return false
  if (set.hints.some((h) => h.completed)) return false
  return distanceMeters(hintCentroid(set), me) >= HINT_REGEN_MIN_M
}
