import { distanceMeters } from '../../map/domain/geo.ts'
import type { LatLng } from '../../map/domain/geo.ts'

// 地図の symbol レイヤーに渡すお店のピンの地物。
// kind: 絵の種類（model と同じ）／fog: 霧の中の近い店か／sort: 現在地からの距離（m）。小さいほど先に置かれ、重なったときに残る
export type PinFeature = {
  type: 'Feature'
  geometry: { type: 'Point'; coordinates: [number, number] }
  properties: { id: string; kind: string; fog: boolean; sort: number }
}

export function pinFeatures(shops: readonly { id: string; model: string; lat: number; lng: number }[], inFog: ReadonlySet<string>, me: LatLng): PinFeature[] {
  return shops.map((s) => ({
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [s.lng, s.lat] },
    properties: { id: s.id, kind: s.model, fog: inFog.has(s.id), sort: Math.round(distanceMeters(me, s)) },
  }))
}
