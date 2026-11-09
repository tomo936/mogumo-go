// 記録の地図をどこに・どれだけ拡大して出すか。純粋な計算。
import { distanceMeters } from '../../map/domain/geo.ts'
import type { LatLng } from '../../map/domain/geo.ts'
import { cellCenter } from '../../fog/domain/grid.ts'
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

