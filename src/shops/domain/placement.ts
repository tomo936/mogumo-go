import type { P } from '../../map/domain/geo.ts'
import { SHOP_MAX_SIZE_M, SHOP_MIN_SIZE_M } from '../config.ts'

export type Placement = { center: P; facingDeg: number; sizeM: number; onFootprint: boolean }

const SOUTH: P = { x: 0, y: -1 }

function closestOnSeg(p: P, a: P, b: P): P {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const l2 = dx * dx + dy * dy
  const t = l2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2)) : 0
  return { x: a.x + t * dx, y: a.y + t * dy }
}

function contains(p: P, ring: P[]): boolean {
  let c = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i]
    const b = ring[j]
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) c = !c
  }
  return c
}

// 北=0・時計回り
const bearing = (v: P) => ((Math.atan2(v.x, v.y) * 180) / Math.PI + 360) % 360

// 原点（店の点）から一番近い道路の点。無ければ null
function nearestRoadPoint(roads: P[][]): P | null {
  let best = Infinity
  let found: P | null = null
  for (const line of roads) {
    for (let i = 1; i < line.length; i++) {
      const c = closestOnSeg({ x: 0, y: 0 }, line[i - 1], line[i])
      const d = Math.hypot(c.x, c.y)
      if (d < best) {
        best = d
        found = c
      }
    }
  }
  return found
}

const clampSize = (m: number) => Math.max(SHOP_MIN_SIZE_M, Math.min(SHOP_MAX_SIZE_M, m))

// 店の点は原点。道路に正面を向け、建物の輪郭があればその真ん中・大きさに合わせる
export function placeShop(roads: P[][], footprints: P[][]): Placement {
  const road = nearestRoadPoint(roads)
  const roadDist = road ? Math.hypot(road.x, road.y) : Infinity
  // 道路が無い・重なりすぎのときは南向き
  const roadDir = road && roadDist > 0.5 ? road : SOUTH

  const ring = footprints.find((r) => contains({ x: 0, y: 0 }, r))
  if (!ring) {
    const sizeM = SHOP_MIN_SIZE_M
    const need = sizeM / 2 + 4
    const back = road && roadDist < need ? need - roadDist : 0
    const d = Math.hypot(roadDir.x, roadDir.y)
    return {
      center: { x: (-roadDir.x / d) * back || 0, y: (-roadDir.y / d) * back || 0 },
      facingDeg: bearing(roadDir),
      sizeM,
      onFootprint: false,
    }
  }

  // 閉じた輪（最初と最後が同じ点）でも開いた輪でも同じに扱う
  const pts = ring.length > 1 && ring[0].x === ring[ring.length - 1].x && ring[0].y === ring[ring.length - 1].y ? ring.slice(0, -1) : ring
  const c = { x: pts.reduce((s, q) => s + q.x, 0) / pts.length, y: pts.reduce((s, q) => s + q.y, 0) / pts.length }
  const toRoad = { x: roadDir.x - c.x, y: roadDir.y - c.y }
  const toRoadLen = Math.hypot(toRoad.x, toRoad.y) || 1
  const area = pts.reduce((s, q, i) => {
    const n = pts[(i + 1) % pts.length]
    return s + (q.x * n.y - n.x * q.y)
  }, 0) / 2

  // 道路に一番向いている辺の外向きの向き＝正面（長い辺をわずかに優先）
  let face = toRoad
  let score = -Infinity
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]
    const b = pts[(i + 1) % pts.length]
    const ex = b.x - a.x
    const ey = b.y - a.y
    const l = Math.hypot(ex, ey)
    if (l < 2) continue
    const n = area > 0 ? { x: ey / l, y: -ex / l } : { x: -ey / l, y: ex / l }
    const s = (n.x * toRoad.x + n.y * toRoad.y) / toRoadLen + l * 0.002
    if (s > score) {
      score = s
      face = n
    }
  }

  // 正面方向と横方向の幅のうち小さい方を大きさにする
  const fx = face.x
  const fy = face.y
  let minF = Infinity
  let maxF = -Infinity
  let minS = Infinity
  let maxS = -Infinity
  for (const q of pts) {
    const u = (q.x - c.x) * fx + (q.y - c.y) * fy
    const v = (q.x - c.x) * fy - (q.y - c.y) * fx
    minF = Math.min(minF, u)
    maxF = Math.max(maxF, u)
    minS = Math.min(minS, v)
    maxS = Math.max(maxS, v)
  }
  return { center: c, facingDeg: bearing(face), sizeM: clampSize(Math.min(maxF - minF, maxS - minS)), onFootprint: true }
}
