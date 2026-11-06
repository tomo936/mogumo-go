// 画面の1点から、押された建物を探す（画面の座標だけで決める）
import { localFrame } from '../../map/domain/geo.ts'
import type { PlacedShop } from './shopLayer.ts'

type Pt = { x: number; y: number }
type Project = (p: { lat: number; lng: number }) => Pt

const HIT_RADIUS_RATE = 0.7 // 当たりの半径 = 建物の大きさ × これ（m）
const CENTER_RISE_RATE = 0.5 // 建物の見た目の中心は、根元より大きさ × これ（m）上
const MIN_HIT_PX = 16 // 指で押せる最低の半径

// いちばん中心が近い当たりの店の id。無ければ null
export function pickShop(shops: readonly PlacedShop[], tap: Pt, project: Project): string | null {
  let best: string | null = null
  let bestD = Infinity
  for (const s of shops) {
    const base = project(s)
    // 1m あたりの px（東へ 10m 先との距離から。回転しても同じ）
    const east = project(localFrame(s).back({ x: 10, y: 0 }))
    const ppm = Math.hypot(east.x - base.x, east.y - base.y) / 10
    const cx = base.x
    const cy = base.y - s.sizeM * CENTER_RISE_RATE * ppm
    const r = Math.max(s.sizeM * HIT_RADIUS_RATE * ppm, MIN_HIT_PX)
    const d = Math.hypot(tap.x - cx, tap.y - cy)
    if (d <= r && d < bestD) {
      best = s.id
      bestD = d
    }
  }
  return best
}
