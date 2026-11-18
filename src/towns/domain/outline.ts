// 記録の地図に出す「町の範囲」の線と名前（純粋な計算だけ）。
// クリアした町は実線、途中の町は点線。名前は町の四角（bbox）の真ん中に小さく置く。
import type { Bbox, Geometry } from './shape.ts'

export type OutlineTown = { id: string; name: string; geom: Geometry; bbox: Bbox; cleared: boolean }

type Feature = { type: 'Feature'; properties: Record<string, unknown>; geometry: unknown }
export type Collection = { type: 'FeatureCollection'; features: Feature[] }

// 見えている範囲（minLng, minLat, maxLng, maxLat）と重なる町だけ
export function inView(towns: OutlineTown[], view: Bbox): OutlineTown[] {
  return towns.filter((t) => t.bbox[0] <= view[2] && t.bbox[2] >= view[0] && t.bbox[1] <= view[3] && t.bbox[3] >= view[1])
}

const rings = (g: Geometry): number[][][] => (g.type === 'Polygon' ? g.coordinates : g.coordinates.flat())

// 線（輪郭）。MultiPolygon も穴も、輪ごとの線にする
export function lineCollection(towns: OutlineTown[]): Collection {
  return {
    type: 'FeatureCollection',
    features: towns.map((t) => ({
      type: 'Feature',
      properties: { id: t.id, cleared: t.cleared },
      geometry: { type: 'MultiLineString', coordinates: rings(t.geom) },
    })),
  }
}

// 名前の札（点）
export function labelCollection(towns: OutlineTown[]): Collection {
  return {
    type: 'FeatureCollection',
    features: towns.map((t) => ({
      type: 'Feature',
      properties: { id: t.id, name: t.name, cleared: t.cleared },
      geometry: { type: 'Point', coordinates: [(t.bbox[0] + t.bbox[2]) / 2, (t.bbox[1] + t.bbox[3]) / 2] },
    })),
  }
}
