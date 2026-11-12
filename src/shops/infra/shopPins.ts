// 1軒だけの店のピン（地図の symbol レイヤー。MapLibre が GPU で描く）。重なっても全部出す（2026-11-13 オーナー「居酒屋が被ってると片方しか出ない」）。
// 画像の登録・GeoJSON source の更新・レイヤー追加・タップの当たり判定をここに閉じこめる。
// 雲より下に描く層（晴れた所の店）と、雲の上に描く層（霧の中の近い店）の2つ。
import type { GeoJSONSource, Map as MapLibreMap } from 'maplibre-gl'
import type { LatLng } from '../../map/domain/geo.ts'
import { pinFeatures } from '../domain/pinFeatures.ts'
import { LIFT_TIERS } from '../domain/pinLift.ts'
import { checkBadgeImage } from './checkBadge.ts'
import { PIN_ICON } from './pinIcons.ts'
import { CLUSTER_UNTIL_ZOOM } from '../domain/cluster.ts'

export const PIN_SOURCE = 'shop-pins'
export const PIN_LAYER = 'shop-pins' // 晴れた所の店（雲より下）
export const PIN_LAYER_FOG = 'shop-pins-fog' // 霧の中の近い店（雲の上）
const TAP_PAD_PX = 8 // 指で押す余裕

// 絵は 128px。画面での大きさは ズーム16で約28px、ズーム18で約37px（ビルのピンと同じくらい）
const SIZE_AT_16 = 0.22
const SIZE_AT_18 = 0.29
const ICON_SIZE = ['interpolate', ['linear'], ['zoom'], 16, SIZE_AT_16, 18, SIZE_AT_18] as const

// ピンを地面の点から屋根の少し上へ持ち上げる。画面の真上へずらす近似（3D カメラでの屋根の位置とは合わせない）。
// 持ち上げる高さは店の模型の高さの段（低・中・高。地物の liftTier）ごとに変える。
// 目安: ズーム17.5 で 1m あたり CSS 3px（10m で約 30px）、ズームが1上がると約2倍（建物の高さは地図の縮尺に比例するため）。
// icon-offset は icon-size 倍されるので、設定する値は「見せたい px ÷ そのズームの icon-size」。
export const LIFT_PX_PER_M_AT_17_5 = 3
export function iconSizeAt(zoom: number): number {
  const t = Math.min(1, Math.max(0, (zoom - 16) / 2))
  return SIZE_AT_16 + (SIZE_AT_18 - SIZE_AT_16) * t
}
const LIFT_ZOOMS = [14, 15, 16, 17, 18, 19, 20] // 整数ズームごとに計算し、間は直線でつなぐ（誤差は数px）
export function liftOffsetAt(zoom: number, heightM: number): [number, number] {
  const px = LIFT_PX_PER_M_AT_17_5 * heightM * 2 ** (zoom - 17.5)
  return [0, -Math.round((px / iconSizeAt(zoom)) * 10) / 10]
}
// 式は配列を動的に作れないので、ズームごとに「段 → literal」の match を用意する
const ICON_OFFSET = [
  'interpolate',
  ['linear'],
  ['zoom'],
  ...LIFT_ZOOMS.flatMap((z) => [
    z,
    ['match', ['get', 'liftTier'], 'low', ['literal', liftOffsetAt(z, LIFT_TIERS.low.repM)], 'high', ['literal', liftOffsetAt(z, LIFT_TIERS.high.repM)], ['literal', liftOffsetAt(z, LIFT_TIERS.mid.repM)]],
  ]),
] as const

type Placed = { id: string; model: string; lat: number; lng: number; sizeM?: number }

export function createShopPins(map: MapLibreMap) {
  let attached = false
  let hidden = false // 「ピンを出さない」のボタン
  let moving = false // 人が地図を動かしている間（map/infra/userMove.ts）
  let disposed = false
  let pending: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] }

  const layer = (id: string, fog: boolean) => ({
    id,
    type: 'symbol' as const,
    source: PIN_SOURCE,
    // 晴れた所のピンは寄ったときだけ（引いたら shopClusters がまとめて出す）。霧の中の近い店はいつも
    ...(fog ? {} : { minzoom: CLUSTER_UNTIL_ZOOM }),
    filter: ['==', ['get', 'fog'], fog] as never,
    layout: {
      'icon-image': ['concat', 'pin-', ['get', 'kind'], ['case', ['get', 'done'], '-done', '']] as never, // 済みの店は右上に ✓ の付いた絵
      'icon-size': ICON_SIZE as never,
      'icon-anchor': 'bottom' as const, // ピンの先（絵の下の真ん中）を店の位置に合わせる
      'icon-offset': ICON_OFFSET as never, // そこから屋根の少し上へ持ち上げる
      'icon-allow-overlap': true, // 重なっても間引かない
      'icon-ignore-placement': true, // ほかの文字やピンも隠さない
      'symbol-z-order': 'viewport-y' as const, // 画面の下（カメラに近い）ピンほど前に描く
      visibility: hidden || moving ? ('none' as const) : ('visible' as const),
    },
  })

  const applyVisibility = () => {
    if (!attached) return
    const v = hidden || moving ? 'none' : 'visible'
    for (const id of [PIN_LAYER, PIN_LAYER_FOG]) if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', v)
  }

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
            if (disposed) return
            if (!map.hasImage(`pin-${kind}`)) map.addImage(`pin-${kind}`, data)
            const done = checkBadgeImage(data) // 右上に緑の ✓ を重ねた絵（作れない環境では済みでも ✓ なし）
            if (done && !map.hasImage(`pin-${kind}-done`)) map.addImage(`pin-${kind}-done`, done)
          })
          .catch(() => {}) // 絵が読めない店は、ピンだけ出ない
      }
    },
    update(shops: readonly Placed[], inFog: ReadonlySet<string>, me: LatLng, checked: ReadonlySet<string> = new Set()) {
      pending = { type: 'FeatureCollection', features: pinFeatures(shops, inFog, me, checked) as GeoJSON.Feature[] }
      if (attached) (map.getSource(PIN_SOURCE) as GeoJSONSource | undefined)?.setData(pending)
    },
    // 2層（✓ の付いた絵もこの層の中）をまとめて出す・出さない。気配のピンは別なので変わらない
    setVisible(visible: boolean) {
      hidden = !visible
      applyVisibility()
    },
    // 人が地図を動かしている間は隠す（ビルのピンと同じ）
    setMoving(next: boolean) {
      moving = next
      applyVisibility()
    },
    // 押された点にあるピンの店 id（なければ null）。雲の上の層を先に見る
    pick(point: { x: number; y: number }): string[] | null {
      if (!attached || hidden) return null
      const box: [[number, number], [number, number]] = [[point.x - TAP_PAD_PX, point.y - TAP_PAD_PX], [point.x + TAP_PAD_PX, point.y + TAP_PAD_PX]]
      const hit = map.queryRenderedFeatures(box, { layers: [PIN_LAYER_FOG, PIN_LAYER] })[0]
      return hit ? [String(hit.properties.id)] : null
    },
    dispose() {
      disposed = true
      for (const id of [PIN_LAYER_FOG, PIN_LAYER]) if (map.getLayer(id)) map.removeLayer(id)
      if (map.getSource(PIN_SOURCE)) map.removeSource(PIN_SOURCE)
      for (const kind of Object.keys(PIN_ICON)) for (const id of [`pin-${kind}`, `pin-${kind}-done`]) if (map.hasImage(id)) map.removeImage(id)
    },
  }
}
