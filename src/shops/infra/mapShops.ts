import { distanceMeters } from '../../map/domain/geo.ts'
import type { LatLng } from '../../map/domain/geo.ts'
import { kindFromMap } from '../domain/kind.ts'
import type { Shop } from '../domain/shop.ts'
import { SOURCE } from './mapFeatures.ts'
import type { FeatureSource } from './mapFeatures.ts'

// supabase/functions/checkin/core.ts の FOOD と同じにしておくこと（keep in sync）
const FOOD = new Set(['restaurant', 'cafe', 'fast_food', 'bar', 'pub', 'bakery', 'confectionery', 'ice_cream'])

// 地図タイルの poi から飲食店を取り出す（center から radiusM 以内）。タイルの重なりで同じ店が複数回出るので id で1件にする。
// 駅（station・halt。地下鉄・路面電車は除く）と施設（mall・department_store）の名前つきの点
export type Landmark = { lat: number; lng: number; name: string; kind: 'station' | 'facility' }

// landmarksOut を渡すと、同じ読み込みで駅と施設の点も集める（poi を2回読まないため）。名前は日本語名を優先
export function extractMapShops(src: FeatureSource, center: LatLng, radiusM: number, landmarksOut?: Landmark[]): Shop[] {
  const seen = new Set<string>()
  const shops: Shop[] = []
  for (const f of src.querySourceFeatures(SOURCE, { sourceLayer: 'poi' })) {
    const subclass = f.properties.subclass
    const name = f.properties.name
    const station = f.properties.class === 'railway' && (subclass === 'station' || subclass === 'halt')
    if (landmarksOut && (station || subclass === 'mall' || subclass === 'department_store') && f.geometry.type === 'Point') {
      const ja = f.properties['name:ja']
      const label = typeof ja === 'string' && ja ? ja : typeof name === 'string' ? name : ''
      const [lng, lat] = f.geometry.coordinates
      if (distanceMeters(center, { lat, lng }) <= radiusM) landmarksOut.push({ lat, lng, name: label, kind: station ? 'station' : 'facility' })
      continue
    }
    // 安い判定を先に（密集地では1万件を超えることがある）
    if (typeof subclass !== 'string' || !FOOD.has(subclass)) continue
    if (typeof name !== 'string' || name === '') continue
    if (f.id === undefined || f.geometry.type !== 'Point') continue
    const id = `osm:${f.id}`
    if (seen.has(id)) continue
    const [lng, lat] = f.geometry.coordinates
    if (distanceMeters(center, { lat, lng }) > radiusM) continue
    seen.add(id)
    shops.push({ id, name, lat, lng, kind: kindFromMap(subclass, name), details: null, mapId: null })
  }
  return shops
}
