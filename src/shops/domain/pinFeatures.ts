import { distanceMeters } from '../../map/domain/geo.ts'
import type { LatLng } from '../../map/domain/geo.ts'
import { liftM, liftTier } from './pinLift.ts'
import type { LiftTier } from './pinLift.ts'
import type { ShopKind } from './shop.ts'

// 地図の symbol レイヤーに渡すお店のピンの地物。
// done: チェックイン済みか（右上に ✓ の付いた絵を使う）
// liftM: 模型の高さ＋少し（m）／liftTier: その段（低・中・高。ピンの持ち上げを選ぶ）
// kind: 絵の種類（model と同じ）／fog: 霧の中の近い店か／sort: 現在地からの距離（m。今は描く順に使っていない＝重なっても全部出し、画面の下ほど手前に描く）
export type PinFeature = {
  type: 'Feature'
  geometry: { type: 'Point'; coordinates: [number, number] }
  properties: { id: string; kind: string; fog: boolean; done: boolean; sort: number; liftM: number; liftTier: LiftTier }
}

export function pinFeatures(shops: readonly { id: string; model: string; lat: number; lng: number; sizeM?: number }[], inFog: ReadonlySet<string>, me: LatLng, checked: ReadonlySet<string> = new Set()): PinFeature[] {
  return shops.map((s) => ({
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [s.lng, s.lat] },
    properties: { id: s.id, kind: s.model, fog: inFog.has(s.id), done: checked.has(s.id), sort: Math.round(distanceMeters(me, s)), ...lift(s) },
  }))
}

const DEFAULT_SIZE_M = 16 // 大きさが分からない店の目安

function lift(s: { model: string; sizeM?: number }): { liftM: number; liftTier: LiftTier } {
  const m = Math.round(liftM(s.model as ShopKind, s.sizeM ?? DEFAULT_SIZE_M) * 10) / 10
  return { liftM: m, liftTier: liftTier(m) }
}
