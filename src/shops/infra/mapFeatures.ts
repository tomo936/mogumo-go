import type { Geometry } from 'geojson'
import { localFrame } from '../../map/domain/geo.ts'
import type { LatLng, P } from '../../map/domain/geo.ts'

// maplibregl.Map がそのまま当てはまる最小の型（テストではにせ物を渡す）。_z は読んだタイルのズーム
export type FeatureSource = {
  querySourceFeatures(
    source: string,
    opts: { sourceLayer: string },
  ): { geometry: Geometry; properties: Record<string, unknown>; id?: number | string; _z?: number }[]
}

export const SOURCE = 'openmaptiles'
const ROAD_CLASSES = new Set([
  'motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'minor', 'service', 'street', 'path', 'pedestrian',
])

type Position = number[]
type Box = { x0: number; y0: number; x1: number; y1: number }
type Item = { pts: P[]; box: Box }
// 読み込み済みタイルの道路と建物の輪郭（origin を原点にした m）。輪郭はズームの大きいタイルのものが先
// footprints の h はタイルの render_height（無ければ 10）
export type AreaFeatures = { roads: Item[]; footprints: (Item & { z: number; h: number })[] }

function segDist(a: P, b: P): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len2 = dx * dx + dy * dy
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, -(a.x * dx + a.y * dy) / len2))
  return Math.hypot(a.x + t * dx, a.y + t * dy)
}

// 原点（0,0）から線までの最短距離
function minDist(pts: P[]): number {
  let m = Infinity
  for (let i = 0; i + 1 < pts.length; i++) m = Math.min(m, segDist(pts[i], pts[i + 1]))
  return pts.length === 1 ? Math.hypot(pts[0].x, pts[0].y) : m
}

function contains(ring: P[]): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i]
    const b = ring[j]
    if (a.y > 0 !== b.y > 0 && 0 < ((b.x - a.x) * (0 - a.y)) / (b.y - a.y) + a.x) inside = !inside
  }
  return inside
}

function boxOf(pts: P[]): Box {
  const b = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity }
  for (const p of pts) {
    b.x0 = Math.min(b.x0, p.x)
    b.y0 = Math.min(b.y0, p.y)
    b.x1 = Math.max(b.x1, p.x)
    b.y1 = Math.max(b.y1, p.y)
  }
  return b
}

// 点 at から箱までの距離（箱の中なら 0）
const boxDist = (b: Box, at: P) => Math.hypot(Math.max(b.x0 - at.x, 0, at.x - b.x1), Math.max(b.y0 - at.y, 0, at.y - b.y1))

// タイルを1回だけ読み、origin から rangeM 以内の道路と輪郭を m に直す（1回の更新で1回だけ呼ぶ）
export function extractFeatures(src: FeatureSource, origin: LatLng, rangeM: number): AreaFeatures {
  const frame = localFrame(origin)
  const zero = { x: 0, y: 0 }
  const item = (line: Position[]): Item | null => {
    const pts = line.map((c) => frame.to({ lng: c[0], lat: c[1] }))
    const box = boxOf(pts)
    return boxDist(box, zero) <= rangeM ? { pts, box } : null
  }

  const roads: Item[] = []
  for (const f of src.querySourceFeatures(SOURCE, { sourceLayer: 'transportation' })) {
    if (!ROAD_CLASSES.has(String(f.properties.class))) continue
    const g = f.geometry
    const lines = g.type === 'LineString' ? [g.coordinates] : g.type === 'MultiLineString' ? g.coordinates : []
    for (const l of lines) {
      const it = item(l)
      if (it) roads.push(it)
    }
  }

  const footprints: (Item & { z: number; h: number })[] = []
  for (const f of src.querySourceFeatures(SOURCE, { sourceLayer: 'building' })) {
    const g = f.geometry
    const outers = g.type === 'Polygon' ? [g.coordinates[0]] : g.type === 'MultiPolygon' ? g.coordinates.map((p) => p[0]) : []
    for (const o of outers) {
      const it = item(o)
      if (it) footprints.push({ ...it, z: f._z ?? 0, h: typeof f.properties.render_height === 'number' ? f.properties.render_height : 10 })
    }
  }
  // 低いズームの簡略な輪郭より、細かいタイルの輪郭を先に当てる
  footprints.sort((a, b) => b.z - a.z)
  return { roads, footprints }
}

export const NEAR_M = 60 // 店の置き方に使う道路・輪郭の範囲

// 店の点 at のまわり rangeM 以内の道路と輪郭を、at を原点にずらして返す
export function featuresNear(all: AreaFeatures, at: P, rangeM = NEAR_M): { roads: P[][]; footprints: P[][]; heights: number[] } {
  const shift = (pts: P[]) => pts.map((p) => ({ x: p.x - at.x, y: p.y - at.y }))
  const roads: P[][] = []
  for (const r of all.roads) {
    if (boxDist(r.box, at) > rangeM) continue
    const pts = shift(r.pts)
    if (minDist(pts) <= rangeM) roads.push(pts)
  }
  const footprints: P[][] = []
  const heights: number[] = []
  let topZ: number | null = null // 点を含む輪郭の、いちばん細かいタイルのズーム（輪郭はズームの大きい順に並んでいる）
  for (const f of all.footprints) {
    if (boxDist(f.box, at) > rangeM) continue
    const ring = shift(f.pts)
    if (contains(ring)) {
      topZ ??= f.z
      if (f.z < topZ) continue // 同じ建物の簡略な形（ズームの小さいタイル）は使わない
      footprints.push(ring)
      heights.push(f.h)
    } else if (minDist(ring) <= rangeM) {
      footprints.push(ring)
      heights.push(f.h)
    }
  }
  return { roads, footprints, heights }
}
