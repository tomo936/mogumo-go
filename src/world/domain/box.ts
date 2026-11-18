// 町の四角（bbox）の中心と、ちょうど入る寄り。純粋な計算。
export type Box = { minLat: number; maxLat: number; minLng: number; maxLng: number }

export function boxCenter(b: Box): { lat: number; lng: number } {
  return { lat: (b.minLat + b.maxLat) / 2, lng: (b.minLng + b.maxLng) / 2 }
}

const mercY = (lat: number) => {
  const s = Math.sin((lat * Math.PI) / 180)
  return 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI) // 0..1（北が小さい）
}

// 512px タイル基準（ズーム 0 で地球 1 周が 512px）。四角が画面に少し余裕をもって入るズームを min..max に収める
export function zoomForBox(b: Box, widthPx: number, heightPx: number, min: number, max: number): number {
  const fx = Math.max((b.maxLng - b.minLng) / 360, 1e-9)
  const fy = Math.max(mercY(b.minLat) - mercY(b.maxLat), 1e-9)
  const margin = 1.15
  const zx = Math.log2(widthPx / (512 * fx * margin))
  const zy = Math.log2(heightPx / (512 * fy * margin))
  return Math.min(max, Math.max(min, Math.min(zx, zy)))
}
