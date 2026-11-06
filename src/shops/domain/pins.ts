import { PIN_COLLAPSE_ZOOM, PIN_GAP_PX, PIN_MAX_SPREAD } from '../config.ts'

const ARCH_PX = 8 // 真ん中のピンを端より上げる高さ

// ビルの上のピンの並べ方（ビルの位置からの px のずれ）。多すぎる・縮小しているときは 'collapsed'（1つ＋「済み/全部」）
export function pinLayout(n: number, zoom: number): { x: number; y: number }[] | 'collapsed' {
  if (n > PIN_MAX_SPREAD || zoom < PIN_COLLAPSE_ZOOM) return 'collapsed'
  const mid = (n - 1) / 2
  return Array.from({ length: n }, (_, i) => {
    const t = mid ? (i - mid) / mid : 0
    return { x: (i - mid) * PIN_GAP_PX, y: n > 1 ? -ARCH_PX * (1 - t * t) : 0 }
  })
}
