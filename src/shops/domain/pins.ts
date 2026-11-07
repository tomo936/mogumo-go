import { PIN_COLLAPSE_ZOOM, PIN_GAP_PX, PIN_MAX_SPREAD } from '../config.ts'

const ARCH_PX = 8 // 真ん中のピンを端より上げる高さ

// ビルの上のピンの並べ方（ビルの位置からの px のずれ）と、並べきれない残りの数。
// 大型の施設・縮小しているときは 'collapsed'（1つ＋「済み/全部」）
export function pinLayout(n: number, zoom: number, facility: boolean): { pins: { x: number; y: number }[]; more: number } | 'collapsed' {
  if (facility || zoom < PIN_COLLAPSE_ZOOM) return 'collapsed'
  const shown = Math.min(n, PIN_MAX_SPREAD)
  const mid = (shown - 1) / 2
  const pins = Array.from({ length: shown }, (_, i) => {
    const t = mid ? (i - mid) / mid : 0
    return { x: (i - mid) * PIN_GAP_PX, y: shown > 1 ? -ARCH_PX * (1 - t * t) : 0 }
  })
  return { pins, more: n - shown }
}
