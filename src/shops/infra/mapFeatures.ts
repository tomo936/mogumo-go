import type { Geometry } from 'geojson'
import { localFrame } from '../../map/domain/geo.ts'
import type { LatLng, P } from '../../map/domain/geo.ts'

// maplibregl.Map がそのまま当てはまる最小の型（テストではにせ物を渡す）
export type FeatureSource = {
  querySourceFeatures(
    source: string,
    opts: { sourceLayer: string },
  ): { geometry: Geometry; properties: Record<string, unknown> }[]
}

const SOURCE = 'openmaptiles'
const ROAD_CLASSES = new Set([
  'motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'minor', 'service', 'street', 'path', 'pedestrian',
])

type Position = number[]

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

export function roadsAndFootprints(
  src: FeatureSource,
  origin: LatLng,
  rangeM = 60,
): { roads: P[][]; footprints: P[][] } {
  const frame = localFrame(origin)
  const toLocal = (line: Position[]): P[] => line.map((c) => frame.to({ lng: c[0], lat: c[1] }))

  const roads: P[][] = []
  for (const f of src.querySourceFeatures(SOURCE, { sourceLayer: 'transportation' })) {
    if (!ROAD_CLASSES.has(String(f.properties.class))) continue
    const g = f.geometry
    const lines = g.type === 'LineString' ? [g.coordinates] : g.type === 'MultiLineString' ? g.coordinates : []
    for (const l of lines) {
      const pts = toLocal(l)
      if (minDist(pts) <= rangeM) roads.push(pts)
    }
  }

  const footprints: P[][] = []
  for (const f of src.querySourceFeatures(SOURCE, { sourceLayer: 'building' })) {
    const g = f.geometry
    const outers = g.type === 'Polygon' ? [g.coordinates[0]] : g.type === 'MultiPolygon' ? g.coordinates.map((p) => p[0]) : []
    for (const o of outers) {
      const ring = toLocal(o)
      if (contains(ring) || minDist(ring) <= rangeM) footprints.push(ring)
    }
  }
  return { roads, footprints }
}
