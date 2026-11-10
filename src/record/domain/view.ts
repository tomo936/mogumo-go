// 記録の地図をどこに・どれだけ拡大して出すか。純粋な計算。
import { distanceMeters } from '../../map/domain/geo.ts'
import type { LatLng } from '../../map/domain/geo.ts'
import { cellCenter } from '../../fog/domain/grid.ts'
import { localFrame } from '../../map/domain/geo.ts'
import type { ClumpBox } from '../../fog/domain/clumps.ts'
import type { ClearedCell } from './timeline.ts'

export const MIN_ZOOM = 13
export const MAX_ZOOM = 17
const VIEW_RADIUS_CAP_M = 1100 // 雲を置く範囲（現在地から 1200m）に収める

// 全体が入る中心と半径（m）。自宅があれば自宅を中心にする
export function viewOf(cells: ClearedCell[], home: LatLng | null): { center: LatLng; radiusM: number } {
  if (home) {
    let r = 250
    for (const c of cells) r = Math.max(r, distanceMeters(home, cellCenter(c)))
    return { center: home, radiusM: Math.min(r, VIEW_RADIUS_CAP_M) }
  }
  if (cells.length === 0) return { center: { lat: 35.6812, lng: 139.7671 }, radiusM: 400 }
  let lat = 0
  let lng = 0
  for (const c of cells) {
    const p = cellCenter(c)
    lat += p.lat
    lng += p.lng
  }
  const center = { lat: lat / cells.length, lng: lng / cells.length }
  let r = 250
  for (const c of cells) r = Math.max(r, distanceMeters(center, cellCenter(c)))
  return { center, radiusM: Math.min(r, VIEW_RADIUS_CAP_M) }
}

// 半径 radiusM が幅 widthPx に入るズーム
export function zoomFor(radiusM: number, widthPx: number, lat: number): number {
  const target = (radiusM * 1.15 * 2) / widthPx // 1px あたりの m
  const z = Math.log2((156543.03392 * Math.cos((lat * Math.PI) / 180)) / target)
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z))
}


// 記録の地図の雲は、いちばん引いたとき（MIN_ZOOM）でも画面が埋まる広さまで置く。
// 地図はどこまでも動かせる（出張先も見られる）。離れたら、そこを中心に雲を置き直す
export const FAR_HALF_M = 3000
export const REBUILD_M = 1500

// 晴れた場所のまわりの四角（origin からの m）。雲の形が晴れ方で変わるのはこの中だけ
const BOX_MARGIN_M = 120
export function clearedBox(points: LatLng[], origin: LatLng, half: number): ClumpBox | null {
  const f = localFrame(origin)
  let box: ClumpBox | null = null
  for (const p of points) {
    const { x, y } = f.to(p)
    if (Math.abs(x) > half + BOX_MARGIN_M || Math.abs(y) > half + BOX_MARGIN_M) continue
    box = box
      ? { x0: Math.min(box.x0, x - BOX_MARGIN_M), x1: Math.max(box.x1, x + BOX_MARGIN_M), y0: Math.min(box.y0, y - BOX_MARGIN_M), y1: Math.max(box.y1, y + BOX_MARGIN_M) }
      : { x0: x - BOX_MARGIN_M, x1: x + BOX_MARGIN_M, y0: y - BOX_MARGIN_M, y1: y + BOX_MARGIN_M }
  }
  return box
}
export const inBox = (c: { x: number; y: number }, b: ClumpBox): boolean => c.x >= b.x0 && c.x <= b.x1 && c.y >= b.y0 && c.y <= b.y1
