// 霧が晴れる波と、お店のまわりの薄い所。純粋な計算だけ。
import { THIN_FULL_M, THIN_START_M, WAVE_SPEED_MPS } from '../config.ts'
import type { Clump } from './clumps.ts'

// w1: 変化後の半幅（消えるなら 0）。start: 変化の始まり（秒）。変化なしは -1
export type AnimClump = Clump & { w1: number; start: number }

const key = (c: Clump) => `${Math.round(c.x * 10)}:${Math.round(c.y * 10)}:${c.seed.toFixed(5)}`

// 変わる前の塊それぞれに、変わった後の姿と始まる時刻（from から遠いほど遅い）を付ける
export function waveClumps(
  before: readonly Clump[],
  after: readonly Clump[],
  from: { x: number; y: number },
  nowS: number,
): AnimClump[] {
  const next = new Map(after.map((c) => [key(c), c.w]))
  return before.map((c) => {
    const w1 = next.get(key(c)) ?? 0
    const start = w1 === c.w ? -1 : nowS + Math.hypot(c.x - from.x, c.y - from.y) / WAVE_SPEED_MPS
    return { ...c, w1, start }
  })
}

// お店からの距離 → 雲の薄さ（0〜1）。近いほど 1
export function thinAmount(distM: number): number {
  const t = Math.min(1, Math.max(0, (THIN_START_M - distM) / (THIN_START_M - THIN_FULL_M)))
  return t * t * (3 - 2 * t)
}
