// 大型施設のタップの当たり判定（画面の座標だけで決める）
import type { LatLng } from '../../map/domain/geo.ts'

type Pt = { x: number; y: number }
type Project = (p: { lat: number; lng: number }) => Pt

// 地図に置く大型施設1つ。parts は立ち上げる輪郭（緯度経度）と高さ、door は入口（ひさし）の位置
// kind: 駅（駅の点を含む）か施設。name: 名前の札（無ければ null）
export type PlacedFacility = {
  id: string
  kind: 'facility' | 'station'
  name: string | null
  shopIds: string[]
  parts: { ring: LatLng[]; heightM: number }[]
  topM: number
  facingDeg: number
  door: LatLng
}

function inside(p: Pt, ring: Pt[]): boolean {
  let c = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i]
    const b = ring[j]
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) c = !c
  }
  return c
}

// 地面の輪郭か、屋根（地面の輪郭を upPx(施設, その部分の高さ) だけ上にずらしたもの）の中を押したら当たり
export function pickFacility(list: readonly PlacedFacility[], tap: Pt, project: Project, upPx: (f: PlacedFacility, heightM: number) => number): PlacedFacility | null {
  for (const f of list) {
    for (const part of f.parts) {
      const ring = part.ring.map(project)
      if (inside(tap, ring) || inside({ x: tap.x, y: tap.y + upPx(f, part.heightM) }, ring)) return f
    }
  }
  return null
}
