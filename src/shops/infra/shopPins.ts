// 地図のピン（1 つの symbol レイヤー。MapLibre が GPU で描く）。2026-11-16 オーナー「整理して修正して」で 1 つにまとめた:
//  - 1 軒のお店（晴れた所・霧の中の近い店）・まとめのピン（引いたとき）・気配のピン（？）を同じ層に入れ、
//    画面の下（手前）のピンほど前に描く（奥の気配が手前に乗らない）。層は自分のキャラより上（キャラがピンを踏まない）。
//  - 倍率 17.7 より引いたら、晴れた所のお店（ビル・施設の中のお店も 1 軒ずつ）を supercluster でまとめる（2 軒から。
//    16〜17 は 140px、17〜17.7 は 70px）。17.7 から 1 軒ずつ（ビルの中のお店は buildingPins）。霧の中の近い店と気配はいつも単独。
//  - まとめのピンを押すと、その場所へカメラを寄せ、まとめがなくなる倍率（17.7）まで寄る（カメラの寄せは MapView）。
// 画像の登録・GeoJSON source の更新・レイヤー追加・タップの当たり判定をここに閉じこめる。
import type { GeoJSONSource, Map as MapLibreMap } from 'maplibre-gl'
import type { LatLng } from '../../map/domain/geo.ts'
import Supercluster from 'supercluster'
import type { PointFeature } from 'supercluster'
import mysteryPin from '../../assets/pins/mystery.png'
import { pinFeatures } from '../domain/pinFeatures.ts'
import type { PinFeature } from '../domain/pinFeatures.ts'
import { CLUSTER_MIN_POINTS, clusterScale, clusterStage, FACILITY_CLUSTER_UNTIL_ZOOM } from '../domain/cluster.ts'
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
const SIDE_PX = 15 // 2 本を左右に並べるときのずれ（画面の px）
const shopLift = (z: number, side: number) => {
  const at = (repM: number): [number, number] => {
    const [x, y] = liftOffsetAt(z, repM)
    return [x + Math.round((side * SIDE_PX * 10) / iconSizeAt(z)) / 10, y]
  }
  return ['match', ['get', 'liftTier'], 'low', ['literal', at(LIFT_TIERS.low.repM)], 'high', ['literal', at(LIFT_TIERS.high.repM)], ['literal', at(LIFT_TIERS.mid.repM)]]
}

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
      // お店: 高さの段で持ち上げ、左右に並べるとき（side）は横へずらす
      ['match', ['get', 'side'], 'l', shopLift(z, -1), 'r', shopLift(z, 1), shopLift(z, 0)],
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
  const stage = clusterStage(zoom)
  if (stage) {
    // 引き: 晴れた所のお店をまとめる（ビルの中のお店も 1 軒ずつ入っている）。霧の中の近い店は単独。
    // まとめ方は段ごと（倍率 16 の段は 140px、17 の段は 70px）
    const index = new Supercluster<ClusterFeature['properties'], { n: number; done: number; lt: number }>({
      radius: stage.radiusPx,
      extent: 512, // MapLibre の 512px のタイルと同じ（radius が画面の px になる）
      maxZoom: stage.zoom,
      minPoints: CLUSTER_MIN_POINTS,
      map: (p) => ({ n: p.n, done: p.done, lt: p.lt }),
      reduce: (acc, p) => {
        acc.n += p.n
        acc.done += p.done
        acc.lt = Math.max(acc.lt, p.lt)
      },
    })
    // 施設・駅は倍率 17 から前の表記（HTML のピンの列）なので入れない
    const input = zoom >= FACILITY_CLUSTER_UNTIL_ZOOM ? clusterInput.filter((f) => !f.properties.fac) : clusterInput
    index.load(input as unknown as PointFeature<ClusterFeature['properties']>[])
    for (const f of index.getClusters([-180, -85, 180, 85], stage.zoom)) {
      const [lng, lat] = f.geometry.coordinates
      const p = f.properties as Record<string, unknown>
      const shopOf = (q: Record<string, unknown>, at: [number, number]) =>
        point(at[0], at[1], { t: 'shop', id: q.id, ids: q.ids, kind: q.kind, done: Number(q.done) > 0, liftTier: q.liftTier })
      if (p.cluster && Number(p.n) === 2) {
        // まとめた結果が 2 軒なら、数字ではなく 2 本のピン（それぞれの場所。2026-11-16 オーナー「2 なら個別でいい」）
        for (const leaf of index.getLeaves(Number(p.cluster_id), Infinity)) out.push(shopOf(leaf.properties as Record<string, unknown>, leaf.geometry.coordinates as [number, number]))
      } else if (p.cluster) out.push(point(lng, lat, { t: 'cluster', id: `cluster:${p.cluster_id}`, n: p.n, lt: p.lt }))
      else if (Number(p.n) === 2 && typeof p.kinds === 'string') {
        // 2 軒入りのビルがぽつんとあるときは、ビルの所に 2 本を左右に並べる
        const ids = String(p.ids).split(',')
        const kinds = p.kinds.split(',')
        const dones = String(p.dones ?? '').split(',')
        ids.forEach((sid, i) => out.push(point(lng, lat, { t: 'shop', id: sid, ids: sid, kind: kinds[i], done: dones[i] === '1', liftTier: p.liftTier, side: i === 0 ? 'l' : 'r' })))
      }
      // 近くに何もないビル（3 軒以上の 1 つの点）は、そのビルの数のまとめのピン（押すと寄ってほどける）
      else if (Number(p.n) > 2) out.push(point(lng, lat, { t: 'cluster', id: `bld:${String(p.id)}`, n: p.n, lt: p.lt }))
      else out.push(shopOf(p, [lng, lat]))
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
  const stageKey = () => clusterStage(map.getZoom())?.zoom ?? 'all'
  let shownStage = stageKey()

  const data = (): GeoJSON.FeatureCollection => ({
    type: 'FeatureCollection',
    features: pinLayerFeatures(map.getZoom(), singles, clusterInput, hints, bounce) as unknown as GeoJSON.Feature[],
  })
  const push = () => {
    if (attached) (map.getSource(PIN_SOURCE) as GeoJSONSource | undefined)?.setData(data())
  }
  const clusterImages = createClusterImages(map, push)
  // 段（16・17・全部）をまたいだときだけ作り直す（まとめは段ごとに 1 つの整数の倍率で計算するので、またがなければ同じ）
  const onZoom = () => {
    const next = stageKey()
    if (next === shownStage) return
    shownStage = next
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
    // 押された点のピン: お店なら店の id、気配なら ['hint:<id>']、まとめなら ['cluster:<経度>,<緯度>']
    // （まとめの場所へのカメラの寄せは地図の画面がする。自分を追いかけるのを止めてから動かさないと引き戻されるため）
    pick(point: { x: number; y: number }): string[] | null {
      if (!attached || hidden) return null
      // まず指の真下（1px）にある絵だけを探す。重なったピンや近くのピンを取り違えないため（2026-11-23 オーナー「タップと違うお店が反応する」）。
      // 何も無いときだけ、指の余裕（TAP_PAD_PX）を足して探し直す
      const boxOf = (pad: number): [[number, number], [number, number]] => [[point.x - pad, point.y - pad], [point.x + pad, point.y + pad]]
      const hit = (map.queryRenderedFeatures(boxOf(1), { layers: [PIN_LAYER] })[0] ?? map.queryRenderedFeatures(boxOf(TAP_PAD_PX), { layers: [PIN_LAYER] })[0])
      if (!hit) return null
      const p = hit.properties as Record<string, unknown>
      if (p.t === 'hint') return [`hint:${String(p.id)}`]
      if (p.t === 'cluster') {
        const [lng, lat] = (hit.geometry as GeoJSON.Point).coordinates
        return [`cluster:${lng},${lat}`]
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
