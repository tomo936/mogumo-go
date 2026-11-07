import { distanceMeters } from '../../map/domain/geo.ts'
import type { LatLng } from '../../map/domain/geo.ts'
import { kindFromMap } from '../domain/kind.ts'
import type { Shop } from '../domain/shop.ts'
import { SOURCE } from './mapFeatures.ts'
import type { FeatureSource } from './mapFeatures.ts'

// supabase/functions/checkin/core.ts の FOOD と同じにしておくこと（keep in sync）
const FOOD = new Set(['restaurant', 'cafe', 'fast_food', 'bar', 'pub', 'bakery', 'confectionery', 'ice_cream'])

// 地図タイルの poi から飲食店を取り出す（center から radiusM 以内）。タイルの重なりで同じ店が複数回出るので id で1件にする。
// stationsOut を渡すと、同じ読み込みで鉄道の駅の点（station・halt。地下鉄・路面電車は除く）も集める（poi を2回読まないため）
export function extractMapShops(src: FeatureSource, center: LatLng, radiusM: number, stationsOut?: LatLng[]): Shop[] {
  const seen = new Set<string>()
  const shops: Shop[] = []
  for (const f of src.querySourceFeatures(SOURCE, { sourceLayer: 'poi' })) {
    const subclass = f.properties.subclass
    const name = f.properties.name
    if (stationsOut && f.properties.class === 'railway' && (subclass === 'station' || subclass === 'halt') && f.geometry.type === 'Point') {
      const [lng, lat] = f.geometry.coordinates
      if (distanceMeters(center, { lat, lng }) <= radiusM) stationsOut.push({ lat, lng })
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
