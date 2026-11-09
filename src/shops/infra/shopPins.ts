// 1軒だけの店のピン（地図の symbol レイヤー。MapLibre が GPU で描き、重なりは自動で間引く）。
// 画像の登録・GeoJSON source の更新・レイヤー追加・タップの当たり判定をここに閉じこめる。
// 雲より下に描く層（晴れた所の店）と、雲の上に描く層（霧の中の近い店）の2つ。
import type { GeoJSONSource, Map as MapLibreMap } from 'maplibre-gl'
import type { LatLng } from '../../map/domain/geo.ts'
import { pinFeatures } from '../domain/pinFeatures.ts'
import { PIN_ICON } from './pinIcons.ts'

export const PIN_SOURCE = 'shop-pins'
export const PIN_LAYER = 'shop-pins' // 晴れた所の店（雲より下）
export const PIN_LAYER_FOG = 'shop-pins-fog' // 霧の中の近い店（雲の上）
const TAP_PAD_PX = 8 // 指で押す余裕

// 絵は 128px。画面での大きさは ズーム16で約28px、ズーム18で約37px（ビルのピンと同じくらい）
const ICON_SIZE = ['interpolate', ['linear'], ['zoom'], 16, 0.22, 18, 0.29] as const

type Placed = { id: string; model: string; lat: number; lng: number }

export function createShopPins(map: MapLibreMap) {
  let attached = false
  let disposed = false
  let pending: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] }

  const layer = (id: string, fog: boolean) => ({
    id,
    type: 'symbol' as const,
    source: PIN_SOURCE,
    filter: ['==', ['get', 'fog'], fog] as never,
    layout: {
      'icon-image': ['concat', 'pin-', ['get', 'kind']] as never,
      'icon-size': ICON_SIZE as never,
      'icon-anchor': 'bottom' as const, // ピンの先（絵の下の真ん中）を店の位置に合わせる
      'icon-allow-overlap': false,
      'icon-padding': 2,
      'symbol-sort-key': ['get', 'sort'] as never, // 近い店ほど先に置かれる
    },
  })

  return {
    // clearBefore: 晴れた所の店のピンを入れる位置（雲の層の手前）／fogBefore: 霧の中の店のピンの位置（自分の印の手前）
    attach(clearBefore?: string, fogBefore?: string) {
      if (attached || disposed) return
      attached = true
      map.addSource(PIN_SOURCE, { type: 'geojson', data: pending })
      map.addLayer(layer(PIN_LAYER, false), clearBefore)
      map.addLayer(layer(PIN_LAYER_FOG, true), fogBefore)
      for (const [kind, url] of Object.entries(PIN_ICON)) {
        map
          .loadImage(url)
          .then(({ data }) => {
            if (!disposed && !map.hasImage(`pin-${kind}`)) map.addImage(`pin-${kind}`, data)
          })
          .catch(() => {}) // 絵が読めない店は、ピンだけ出ない
      }
    },
    update(shops: readonly Placed[], inFog: ReadonlySet<string>, me: LatLng) {
      pending = { type: 'FeatureCollection', features: pinFeatures(shops, inFog, me) as GeoJSON.Feature[] }
      if (attached) (map.getSource(PIN_SOURCE) as GeoJSONSource | undefined)?.setData(pending)
    },
    // 押された点にあるピンの店 id（なければ null）。雲の上の層を先に見る
    pick(point: { x: number; y: number }): string[] | null {
      if (!attached) return null
      const box: [[number, number], [number, number]] = [[point.x - TAP_PAD_PX, point.y - TAP_PAD_PX], [point.x + TAP_PAD_PX, point.y + TAP_PAD_PX]]
      const hit = map.queryRenderedFeatures(box, { layers: [PIN_LAYER_FOG, PIN_LAYER] })[0]
      return hit ? [String(hit.properties.id)] : null
    },
    dispose() {
      disposed = true
      for (const id of [PIN_LAYER_FOG, PIN_LAYER]) if (map.getLayer(id)) map.removeLayer(id)
      if (map.getSource(PIN_SOURCE)) map.removeSource(PIN_SOURCE)
      for (const kind of Object.keys(PIN_ICON)) if (map.hasImage(`pin-${kind}`)) map.removeImage(`pin-${kind}`)
    },
  }
}
