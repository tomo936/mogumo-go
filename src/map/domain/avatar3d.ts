// 自分の 3D のアバターの決まり（大きさ・動きの選び方・再生の速さ・まばたき・うれしい）。純粋な計算だけ。
import {
  AVATAR_HEIGHT_M, AVATAR_MIN_PX, AVATAR_MOTION_HOLD_MS, AVATAR_RATE_MAX, AVATAR_RATE_MIN,
  AVATAR_RUN_REF_MPS, AVATAR_RUN_SPEED_MPS, AVATAR_WALK_REF_MPS, AVATAR_WALK_SPEED_MPS,
} from '../config.ts'
import { metersPerPixel } from './geo.ts'

// 地図の上での身長（m）。ふだんは AVATAR_HEIGHT_M で固定し、引きすぎて画面で AVATAR_MIN_PX を下回るときだけ大きくする
export function avatarHeightMeters(zoom: number, lat: number): number {
  return Math.max(AVATAR_HEIGHT_M, AVATAR_MIN_PX * metersPerPixel(zoom, lat))
}

// ---- 動き（待機・歩き・走り） ----
export type Motion = 'idle' | 'walk' | 'run'

export function motionFor(speedMps: number): Motion {
  if (speedMps <= AVATAR_WALK_SPEED_MPS) return 'idle'
  if (speedMps >= AVATAR_RUN_SPEED_MPS) return 'run'
  return 'walk'
}

// shown が今出している動き。pending は「速さが示す別の動き」と、それが続いている時間（ms）
export type MotionState = { shown: Motion; pending: Motion | null; heldMs: number }

export const initialMotion: MotionState = { shown: 'idle', pending: null, heldMs: 0 }

// 毎コマ。速さが示す動きが AVATAR_MOTION_HOLD_MS 続いたら替える（途中で戻れば数え直し）
export function stepMotion(s: MotionState, speedMps: number, dtMs: number): MotionState {
  const want = motionFor(speedMps)
  if (want === s.shown) return s.pending === null ? s : { shown: s.shown, pending: null, heldMs: 0 }
  const heldMs = want === s.pending ? s.heldMs + dtMs : dtMs
  if (heldMs >= AVATAR_MOTION_HOLD_MS) return { shown: want, pending: null, heldMs: 0 }
  return { shown: s.shown, pending: want, heldMs }
}

// 歩き・走りの再生の速さ（1 = ファイルのまま）。待機は 1
export function playbackRate(motion: Motion, speedMps: number): number {
  if (motion === 'idle') return 1
  const ref = motion === 'walk' ? AVATAR_WALK_REF_MPS : AVATAR_RUN_REF_MPS
  return Math.min(AVATAR_RATE_MAX, Math.max(AVATAR_RATE_MIN, speedMps / ref))
}

// ---- 顔（材質 face の絵の、横に 4 こま） ----
export type FaceFrame = 0 | 1 | 2 | 3 // 0 ふつう・1 半分・2 とじ・3 うれしい
export const FACE_HAPPY: FaceFrame = 3

const BLINK_STEPS: readonly [FaceFrame, number][] = [[1, 40], [2, 70], [1, 40]] // こまと長さ（ms）。そのあと 0
const BLINK_MIN_MS = 2000
const BLINK_MAX_MS = 6000

// 次のまばたきまでの間（ms）。r は 0〜1 の乱数
export function nextBlinkDelay(r: number): number {
  return BLINK_MIN_MS + (BLINK_MAX_MS - BLINK_MIN_MS) * r
}

// まばたきを始めてから sinceMs のときの顔のこま。終わっていれば 0
export function blinkFrame(sinceMs: number): FaceFrame {
  if (sinceMs < 0) return 0
  let t = sinceMs
  for (const [f, ms] of BLINK_STEPS) {
    if (t < ms) return f
    t -= ms
  }
  return 0
}

export const BLINK_TOTAL_MS = BLINK_STEPS.reduce((a, [, ms]) => a + ms, 0)

// ---- うれしい ----
// うれしいの動きを times 回やる長さ（ms）。clipS は動き 1 回の秒
export function joyDurationMs(clipS: number, times: number): number {
  return clipS * times * 1000
}
