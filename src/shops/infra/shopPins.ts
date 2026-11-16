// 地図のピン（1 つの symbol レイヤー。MapLibre が GPU で描く）。2026-11-16 オーナー「整理して修正して」で 1 つにまとめた:
//  - 1 軒のお店（晴れた所・霧の中の近い店）・まとめのピン（引いたとき）・気配のピン（？）を同じ層に入れ、
//    画面の下（手前）のピンほど前に描く（奥の気配が手前に乗らない）。層は自分のキャラより上（キャラがピンを踏まない）。
//  - 引き（倍率 17 未満）は、晴れた所のお店（ビル・施設の中のお店も 1 軒ずつ）を supercluster でまとめる（2 軒から・140px）。
//    寄り（17 以上）は 1 軒ずつ（ビルの中のお店は buildingPins）。霧の中の近い店と気配はいつも単独。
//  - まとめのピンを押すと、カメラは自分を追いかけたまま倍率 17 まで寄る（中心は動かさない＝引き戻されない）。
// 画像の登録・GeoJSON source の更新・レイヤー追加・タップの当たり判定をここに閉じこめる。
import type { GeoJSONSource, Map as MapLibreMap } from 'maplibre-gl'
import type { LatLng } from '../../map/domain/geo.ts'
import Supercluster from 'supercluster'
import type { PointFeature } from 'supercluster'
import mysteryPin from '../../assets/pins/mystery.png'
import { pinFeatures } from '../domain/pinFeatures.ts'
import type { PinFeature } from '../domain/pinFeatures.ts'
import { CLUSTER_MIN_POINTS, CLUSTER_RADIUS_PX, CLUSTER_UNTIL_ZOOM, clusterScale } from '../domain/cluster.ts'
import type { ClusterFeature } from '../domain/cluster.ts'
import { createClusterImages } from './shopClusters.ts'
import { LIFT_TIERS } from '../domain/pinLift.ts'
import { checkBadgeImage, revealBadgeImage } from './checkBadge.ts'
import { PIN_ICON } from './pinIcons.ts'

export const PIN_SOURCE = 'shop-pins'
export const PIN_LAYER = 'shop-pins' // 全部のピン（自分のキャラより上）
const TAP_PAD_PX = 8 // 指で押す余裕

// 絵は 128px。画面での大きさは ズーム16で約28px、ズーム18で約37px（ビルのピンと同じくらい）
const SIZE_AT_16 = 0.22
const SIZE_AT_18 = 0.29

// ピンを地面の点から屋根の少し上へ持ち上げる。画面の真上へずらす近似（3D カメラでの屋根の位置とは合わせない）。
// 持ち上げる高さは店の模型の高さの段（低・中・高。地物の liftTier）ごとに変える。
// 目安: ズーム17.5 で 1m あたり CSS 3px（10m で約 30px）、ズームが1上がると約2倍（建物の高さは地図の縮尺に比例するため）。
// icon-offset は icon-size 倍されるので、設定する値は「見せたい px ÷ そのズームの icon-size」。
export const LIFT_PX_PER_M_AT_17_5 = 3
export function iconSizeAt(zoom: number): number {
  const t = Math.min(1, Math.max(0, (zoom - 16) / 2))
  return SIZE_AT_16 + (SIZE_AT_18 - SIZE_AT_16) * t
}
export const LIFT_ZOOMS = [14, 15, 16, 17, 18, 19, 20] // 整数ズームごとに計算し、間は直線でつなぐ（誤差は数px）
export function liftOffsetAt(zoom: number, heightM: number): [number, number] {
  const px = LIFT_PX_PER_M_AT_17_5 * heightM * 2 ** (zoom - 17.5)
  return [0, -Math.round((px / iconSizeAt(zoom)) * 10) / 10]
}
// 式は配列を動的に作れないので、ズームごとに「段 → literal」の match を用意する
export const ICON_OFFSET = [
  'interpolate',
  ['linear'],
  ['zoom'],
  ...LIFT_ZOOMS.flatMap((z) => [
    z,
    ['match', ['get', 'liftTier'], 'low', ['literal', liftOffsetAt(z, LIFT_TIERS.low.repM)], 'high', ['literal', liftOffsetAt(z, LIFT_TIERS.high.repM)], ['literal', liftOffsetAt(z, LIFT_TIERS.mid.repM)]],
  ]),
] as const

type Placed = { id: string; model: string; lat: number; lng: number; sizeM?: number }
// 気配のピン（地図の上の「？」。revealed: 30m で正体が分かった）
export type HintPin = { id: string; lat: number; lng: number; revealed: boolean }

const HINT_SIZE = 0.31 // 気配の「？」のピン（128px の絵を約 40px。前の HTML のピンと同じ大きさ）
const BOUNCE_MS = 400
const BOUNCE_SCALE = 1.35

// まとめのピンの大きさ（数で 3 段）と、屋根の上へ持ち上げる量（まとめは中でいちばん高い段）
const TIER = ['step', ['get', 'n'], clusterScale(2), 10, clusterScale(10), 30, clusterScale(30)] as const
const manySize = (z: number) => 0.42 + 0.08 * Math.min(1, Math.max(0, (z - 14) / 3.5))
const clusterLift = (z: number, repM: number): [number, number] => [0, -Math.round(((LIFT_PX_PER_M_AT_17_5 * repM * 2 ** (z - 17.5)) / manySize(z)) * 10) / 10]
const SIZE_ZOOMS = [14, 16, 17, 18]

// 種類（t）ごとの大きさ・持ち上げ。ズームの式はいちばん外に置く決まり（MapLibre）
const ICON_SIZE_ALL = [
  'interpolate', ['linear'], ['zoom'],
  ...SIZE_ZOOMS.flatMap((z) => [
    z,
    ['*', ['coalesce', ['get', 'b'], 1], ['match', ['get', 't'], 'cluster', ['*', manySize(z), TIER], 'hint', HINT_SIZE, iconSizeAt(z)]],
  ]),
] as const
const OFFSET_ALL = [
  'interpolate', ['linear'], ['zoom'],
  ...LIFT_ZOOMS.flatMap((z) => [
    z,
    [
      'match', ['get', 't'],
      'cluster', ['match', ['get', 'lt'], 0, ['literal', clusterLift(z, LIFT_TIERS.low.repM)], 2, ['literal', clusterLift(z, LIFT_TIERS.high.repM)], ['literal', clusterLift(z, LIFT_TIERS.mid.repM)]],
      'hint', ['literal', [0, 0]], // 気配は地面の点にピンの先（前と同じ）
      ['match', ['get', 'liftTier'], 'low', ['literal', liftOffsetAt(z, LIFT_TIERS.low.repM)], 'high', ['literal', liftOffsetAt(z, LIFT_TIERS.high.repM)], ['literal', liftOffsetAt(z, LIFT_TIERS.mid.repM)]],
    ],
  ]),
] as const
const IMAGE_ALL = [
  'match', ['get', 't'],
  'cluster', ['concat', 'cl-', ['to-string', ['get', 'n']]],
  'hint', ['case', ['get', 'revealed'], 'hint-revealed', 'hint'],
  ['concat', 'pin-', ['get', 'kind'], ['case', ['get', 'done'], '-done', '']], // 済みの店は右上に ✓ の付いた絵
] as const

type Out = { type: 'Feature'; geometry: { type: 'Point'; coordinates: [number, number] }; properties: Record<string, unknown> }
const point = (lng: number, lat: number, properties: Record<string, unknown>): Out => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [lng, lat] }, properties })

// 層に渡す点（純粋な組み立て。テストで中身を確かめる）。zoom: 今の倍率
export function pinLayerFeatures(
  zoom: number,
  singles: readonly PinFeature[],
  clusterInput: readonly ClusterFeature[],
  hints: readonly HintPin[],
  bounce: ReadonlyMap<string, number> = new Map(),
): Out[] {
  const out: Out[] = []
  if (zoom < CLUSTER_UNTIL_ZOOM) {
    // 引き: 晴れた所のお店をまとめる（ビルの中のお店も 1 軒ずつ入っている）。霧の中の近い店は単独
    const index = new Supercluster<ClusterFeature['properties'], { n: number; done: number; lt: number }>({
      radius: CLUSTER_RADIUS_PX,
      extent: 512, // MapLibre の 512px のタイルと同じ（radius が画面の px になる）
      maxZoom: CLUSTER_UNTIL_ZOOM - 1,
      minPoints: CLUSTER_MIN_POINTS,
      map: (p) => ({ n: p.n, done: p.done, lt: p.lt }),
      reduce: (acc, p) => {
        acc.n += p.n
        acc.done += p.done
        acc.lt = Math.max(acc.lt, p.lt)
      },
    })
    index.load(clusterInput as unknown as PointFeature<ClusterFeature['properties']>[])
    for (const f of index.getClusters([-180, -85, 180, 85], Math.max(0, Math.floor(Math.min(zoom, CLUSTER_UNTIL_ZOOM - 1))))) {
      const [lng, lat] = f.geometry.coordinates
      const p = f.properties as Record<string, unknown>
      if (p.cluster) out.push(point(lng, lat, { t: 'cluster', id: `cluster:${p.cluster_id}`, n: p.n, lt: p.lt }))
      else out.push(point(lng, lat, { t: 'shop', id: p.id, ids: p.ids, kind: p.kind, done: Number(p.done) > 0, liftTier: p.liftTier }))
    }
    for (const s of singles) if (s.properties.fog) out.push(point(...s.geometry.coordinates, { t: 'shop', ...s.properties, ids: s.properties.id }))
  } else {
    // 寄り: 1 軒ずつ（晴れた所・霧の中の近い店）。ビルの中のお店は buildingPins
    for (const s of singles) out.push(point(...s.geometry.coordinates, { t: 'shop', ...s.properties, ids: s.properties.id }))
  }
  for (const h of hints) out.push(point(h.lng, h.lat, { t: 'hint', id: h.id, revealed: h.revealed, b: bounce.get(h.id) ?? 1 }))
  return out
}

export function createShopPins(map: MapLibreMap) {
  let attached = false
  let hidden = false // 「ピンを出さない」のボタン（気配のピンも消す。2026-11-10 オーナー）
  let moving = false // 人が地図を動かしている間（map/infra/userMove.ts）
  let disposed = false
  let singles: PinFeature[] = []
  let clusterInput: readonly ClusterFeature[] = []
  let hints: readonly HintPin[] = []
  const bounce = new Map<string, number>()
  let far = map.getZoom() < CLUSTER_UNTIL_ZOOM

  const data = (): GeoJSON.FeatureCollection => ({
    type: 'FeatureCollection',
    features: pinLayerFeatures(map.getZoom(), singles, clusterInput, hints, bounce) as unknown as GeoJSON.Feature[],
  })
  const push = () => {
    if (attached) (map.getSource(PIN_SOURCE) as GeoJSONSource | undefined)?.setData(data())
  }
  const clusterImages = createClusterImages(map, push)
  // 引き・寄りをまたいだときだけ作り直す（まとめの計算は倍率 16 の 1 段だけなので、またがなければ同じ）
  const onZoom = () => {
    const next = map.getZoom() < CLUSTER_UNTIL_ZOOM
    if (next === far) return
    far = next
    push()
  }

  const visibility = () => (hidden || moving ? ('none' as const) : ('visible' as const))
  const applyVisibility = () => {
    if (attached && map.getLayer(PIN_LAYER)) map.setLayoutProperty(PIN_LAYER, 'visibility', visibility())
  }

  return {
    // いちばん上に置く（自分のキャラ・雲より上）
    attach() {
      if (attached || disposed) return
      attached = true
      map.on('zoom', onZoom)
      map.addSource(PIN_SOURCE, { type: 'geojson', data: data() })
      map.addLayer({
        id: PIN_LAYER,
        type: 'symbol',
        source: PIN_SOURCE,
        layout: {
          'icon-image': IMAGE_ALL as never,
          'icon-size': ICON_SIZE_ALL as never,
          'icon-anchor': 'bottom', // ピンの先（絵の下の真ん中）を店の位置に合わせる
          'icon-offset': OFFSET_ALL as never, // そこから屋根の少し上へ持ち上げる（気配はそのまま）
          'icon-allow-overlap': true, // 重なっても間引かない
          'icon-ignore-placement': true,
          'symbol-z-order': 'viewport-y', // 画面の下（カメラに近い）ピンほど前に描く
          visibility: visibility(),
        },
      })
      for (const [kind, url] of Object.entries(PIN_ICON)) {
        map
          .loadImage(url)
          .then(({ data: img }) => {
            if (disposed) return
            if (!map.hasImage(`pin-${kind}`)) map.addImage(`pin-${kind}`, img)
            const done = checkBadgeImage(img) // 右上に緑の ✓ を重ねた絵（作れない環境では済みでも ✓ なし）
            if (done && !map.hasImage(`pin-${kind}-done`)) map.addImage(`pin-${kind}-done`, done)
          })
          .catch(() => {}) // 絵が読めない店は、ピンだけ出ない
      }
      // 気配の「？」のピン（ジャンルが分からないよう、どれも同じ絵）と、正体が分かった印「!」付き
      map
        .loadImage(mysteryPin)
        .then(({ data: img }) => {
          if (disposed) return
          if (!map.hasImage('hint')) map.addImage('hint', img)
          const r = revealBadgeImage(img)
          if (!map.hasImage('hint-revealed')) map.addImage('hint-revealed', r ?? img)
        })
        .catch(() => {})
    },
    // 1 軒ずつのピン（晴れた所・霧の中の近い店）。寄ったときと、引いたときの霧の中の近い店に使う
    update(shops: readonly Placed[], inFog: ReadonlySet<string>, me: LatLng, checked: ReadonlySet<string> = new Set()) {
      singles = pinFeatures(shops, inFog, me, checked)
      push()
    },
    // 引いたときにまとめる点（晴れた所のお店。ビル・施設の中のお店も 1 軒ずつ）
    setClusterInput(features: readonly ClusterFeature[]) {
      clusterInput = features
      push()
    },
    setHints(next: readonly HintPin[]) {
      hints = next
      push()
    },
    // 気配のピンをぽんと弾ませる（約 0.4 秒。大きさを 1 → 1.35 → 1）
    bounceHint(id: string) {
      if (!hints.some((h) => h.id === id)) return
      const start = performance.now()
      const step = (now: number) => {
        if (disposed) return
        const t = Math.min(1, (now - start) / BOUNCE_MS)
        bounce.set(id, 1 + (BOUNCE_SCALE - 1) * Math.sin(Math.PI * t))
        push()
        if (t < 1) requestAnimationFrame(step)
        else {
          bounce.delete(id)
          push()
        }
      }
      requestAnimationFrame(step)
    },
    setVisible(visible: boolean) {
      hidden = !visible
      applyVisibility()
    },
    // 人が地図を動かしている間は隠す（ビルのピンと同じ）
    setMoving(next: boolean) {
      moving = next
      applyVisibility()
    },
    // 押された点のピン: お店なら店の id、気配なら ['hint:<id>']、まとめならその場で倍率 17 まで寄って []
    pick(point: { x: number; y: number }): string[] | null {
      if (!attached || hidden) return null
      const box: [[number, number], [number, number]] = [[point.x - TAP_PAD_PX, point.y - TAP_PAD_PX], [point.x + TAP_PAD_PX, point.y + TAP_PAD_PX]]
      const hit = map.queryRenderedFeatures(box, { layers: [PIN_LAYER] })[0]
      if (!hit) return null
      const p = hit.properties as Record<string, unknown>
      if (p.t === 'hint') return [`hint:${String(p.id)}`]
      if (p.t === 'cluster') {
        // カメラは自分を追いかけたまま寄るだけ（中心を動かすと、次のコマで自分の位置へ引き戻される）
        map.easeTo({ zoom: CLUSTER_UNTIL_ZOOM + 0.05, duration: 500 })
        return []
      }
      return [String(p.id)]
    },
    dispose() {
      disposed = true
      map.off('zoom', onZoom)
      clusterImages.dispose()
      if (map.getLayer(PIN_LAYER)) map.removeLayer(PIN_LAYER)
      if (map.getSource(PIN_SOURCE)) map.removeSource(PIN_SOURCE)
      for (const kind of Object.keys(PIN_ICON)) for (const id of [`pin-${kind}`, `pin-${kind}-done`]) if (map.hasImage(id)) map.removeImage(id)
      for (const id of ['hint', 'hint-revealed']) if (map.hasImage(id)) map.removeImage(id)
    },
  }
}
