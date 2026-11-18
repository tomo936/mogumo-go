// 感想の写真を縮める決まり（端末で 250KB 以下・長い辺 1080px 以下）。
export const PHOTO_MAX_BYTES = 250 * 1024
export const PHOTO_MAX_SIDE = 1080
const Q_START = 0.82
const Q_STEP = 0.06
const Q_MIN = 0.5
const SCALE_STEP = 0.85
const SCALE_MIN = 0.3

export function fitSize(w: number, h: number, maxSide: number): { w: number; h: number } {
  const k = Math.min(1, maxSide / Math.max(w, h))
  return { w: Math.max(1, Math.round(w * k)), h: Math.max(1, Math.round(h * k)) }
}

export const FIRST_ATTEMPT = { quality: Q_START, scale: 1 }

export function nextAttempt(a: { quality: number; scale: number }): { quality: number; scale: number } | null {
  const q = Math.round((a.quality - Q_STEP) * 100) / 100
  if (q >= Q_MIN) return { quality: q, scale: a.scale }
  const scale = Math.round(a.scale * SCALE_STEP * 1000) / 1000
  if (scale < SCALE_MIN) return null
  return { quality: Q_START, scale }
}
