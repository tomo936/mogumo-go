// チェックイン済みのお店の上に出す「✓」の印（地図に貼る HTML マーカー）。
// 見えているお店の顔ぶれか済みの一覧が変わったときだけ作り直す（毎コマは動かさない）。
import { Marker } from 'maplibre-gl'
import type { Map as MapLibreMap } from 'maplibre-gl'
import type { PlacedShop } from './shopLayer.ts'

export const CHECK_MARK_OFFSET_PER_SIZE = 1.4 // ズーム17での目安: 上へ sizeM*1.4 px

export function createCheckMarks(map: MapLibreMap) {
  const markers = new Map<string, Marker>()
  return {
    update(shops: readonly PlacedShop[], checked: ReadonlySet<string>) {
      const want = new Map(shops.filter((s) => checked.has(s.id)).map((s) => [s.id, s]))
      for (const [id, m] of markers) {
        if (!want.has(id)) {
          m.remove()
          markers.delete(id)
        }
      }
      for (const [id, s] of want) {
        const at: [number, number] = [s.lng, s.lat]
        const hit = markers.get(id)
        if (hit) {
          hit.setLngLat(at)
          continue
        }
        const el = document.createElement('div')
        el.className = 'check-mark'
        el.textContent = '✓'
        markers.set(id, new Marker({ element: el, offset: [0, -s.sizeM * CHECK_MARK_OFFSET_PER_SIZE] }).setLngLat(at).addTo(map))
      }
    },
    dispose() {
      for (const m of markers.values()) m.remove()
      markers.clear()
    },
  }
}
