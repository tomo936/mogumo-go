// 引いた地図でピンをまとめる層（ズーム 17.5 より引いたときだけ。MapLibre の cluster）。2026-11-13 オーナー（案A）。
// 1 軒の店は今と同じ種類のピン、2 軒以上（まとめ・ビル）は「その他」のピンの右上に丸い数字の札を 1 枚の絵として描く
// （数字はいつも丸の真ん中。桁が増えたら字を小さく、100 以上は 99+）。寄ったら shopPins とビルのピンに任せる。
import type { GeoJSONSource, Map as MapLibreMap } from 'maplibre-gl'
import '@fontsource/m-plus-rounded-1c/800.css'
import baseUrl from '../../assets/pins/cluster-base.png'
import { BADGE_TEXT_FIT, BADGE_WIDEST_TEXT, badgeText, BUILDING_CLUSTER_UNTIL_ZOOM, CLUSTER_MIN_POINTS, CLUSTER_RADIUS_PX, CLUSTER_UNTIL_ZOOM, clusterScale } from '../domain/cluster.ts'
import { LIFT_TIERS } from '../domain/pinLift.ts'
import { ICON_OFFSET, LIFT_PX_PER_M_AT_17_5, LIFT_ZOOMS } from './shopPins.ts'
import type { ClusterFeature } from '../domain/cluster.ts'

export const CLUSTER_SOURCE = 'shop-clusters'
const ONE_LAYER = 'shop-clusters-one'
const MANY_LAYER = 'shop-clusters-many'
const TAP_PAD_PX = 8
const FONT = '"M PLUS Rounded 1c"'
const INK = '#4a2f18'
const TIER = ['step', ['coalesce', ['get', 'total'], ['get', 'n']], clusterScale(2), 10, clusterScale(10), 30, clusterScale(30)] as const
// まとめのピンの大きさ（ズームごと。段の倍率 TIER を掛ける前）と、屋根の上へ持ち上げる量。
// icon-offset は icon-size 倍されるので、見せたい px ÷ そのズームの大きさ（shopPins と同じ考え方。2026-11-13 ピンが下すぎた直し）
const manySize = (z: number) => 0.42 + 0.08 * Math.min(1, Math.max(0, (z - 14) / 3.5)) // 下の icon-size（14→0.42、17.5→0.5）と同じ
const liftFor = (z: number, repM: number): [number, number] => [0, -Math.round(((LIFT_PX_PER_M_AT_17_5 * repM * 2 ** (z - 17.5)) / manySize(z)) * 10) / 10]
const MANY_OFFSET = [
  'interpolate',
  ['linear'],
  ['zoom'],
  ...LIFT_ZOOMS.flatMap((z) => [
    z,
    ['match', ['get', 'lt'], 0, ['literal', liftFor(z, LIFT_TIERS.low.repM)], 2, ['literal', liftFor(z, LIFT_TIERS.high.repM)], ['literal', liftFor(z, LIFT_TIERS.mid.repM)]],
  ]),
] as const
const ICON_SIZE = ['interpolate', ['linear'], ['zoom'], 14, 0.2, 16, 0.22, 18, 0.29] as const // 1 軒のピン（shopPins と同じ大きさ）

// まとめのピンの絵（256px の台＋右上の丸い札）。pixelRatio 2 で使う。
// 札: インクの縁＋右下の平らな影（アプリのボタンと同じ）、橙の地、内側に白い輪。数字は白にインクの縁。
// 字の大きさは桁によらず同じ（「99+」が収まる大きさ）。字の実際の高さを測って、丸のちょうど真ん中に置く
export function drawCluster(base: CanvasImageSource, n: number): ImageData {
  const W = 360, H = 330, PIN = 256
  const cv = document.createElement('canvas')
  cv.width = W
  cv.height = H
  const c = cv.getContext('2d')!
  const px = (W - PIN) / 2, py = H - PIN // ピンの先が絵の下の真ん中
  c.drawImage(base, px, py, PIN, PIN)
  const D = 104, r = D / 2
  const cx = px + PIN - 30, cy = py + 14 // 札の真ん中（ピンの右上にかかる）
  const circle = (x: number, y: number, rr: number) => {
    c.beginPath()
    c.arc(x, y, rr, 0, Math.PI * 2)
  }
  c.fillStyle = INK
  circle(cx + 5, cy + 6, r + 5) // 平らな影
  c.fill()
  circle(cx, cy, r + 5) // インクの縁
  c.fill()
  c.fillStyle = '#ffffff'
  circle(cx, cy, r + 1) // 白い輪
  c.fill()
  c.fillStyle = '#ff7a3d'
  circle(cx, cy, r - 5) // 橙の地
  c.fill()
  // 字の大きさ: 「99+」の幅が丸の BADGE_TEXT_FIT に収まる大きさ（全部の数で同じ）
  c.font = `800 100px ${FONT}`
  const px100 = (100 * D * BADGE_TEXT_FIT) / c.measureText(BADGE_WIDEST_TEXT).width
  const size = Math.min(56, Math.floor(px100))
  c.font = `800 ${size}px ${FONT}`
  const text = badgeText(n)
  const m = c.measureText(text)
  const x = cx - (m.actualBoundingBoxRight - m.actualBoundingBoxLeft) / 2 // 左端 x−L・右端 x＋R の真ん中を cx に
  const y = cy + (m.actualBoundingBoxAscent - m.actualBoundingBoxDescent) / 2
  c.textAlign = 'left'
  c.textBaseline = 'alphabetic'
  c.lineJoin = 'round'
  c.lineWidth = 7
  c.strokeStyle = INK
  c.strokeText(text, x, y)
  c.fillStyle = '#ffffff'
  c.fillText(text, x, y)
  return c.getImageData(0, 0, W, H)
}

export function createShopClusters(map: MapLibreMap) {
  let attached = false
  let disposed = false
  let hidden = false
  let moving = false
  let all: readonly ClusterFeature[] = []
  // 複合施設（bld=1）をまとめに入れるのは、いちばん引いたときだけ（それ以外は今までのビルのピン）
  let farBuildings = map.getZoom() < BUILDING_CLUSTER_UNTIL_ZOOM
  const dataNow = (): GeoJSON.FeatureCollection => ({ type: 'FeatureCollection', features: all.filter((f) => f.properties.bld === 0 || farBuildings) as unknown as GeoJSON.Feature[] })
  const push = () => (map.getSource(CLUSTER_SOURCE) as GeoJSONSource | undefined)?.setData(dataNow())
  const onZoom = () => {
    const far = map.getZoom() < BUILDING_CLUSTER_UNTIL_ZOOM
    if (far === farBuildings) return
    farBuildings = far
    if (attached) push()
  }
  let base: HTMLImageElement | null = null
  const pending = new Set<number>()

  const addClusterImage = (n: number) => {
    const id = `cl-${n}`
    if (!base || map.hasImage(id)) return
    map.addImage(id, drawCluster(base, n), { pixelRatio: 2 })
  }
  const onMissing = (e: { id: string }) => {
    const m = /^cl-(\d+)$/.exec(e.id)
    if (!m) return
    if (base) addClusterImage(Number(m[1]))
    else pending.add(Number(m[1]))
  }
  // 台の絵と丸い字が読めてから描く（それまでの分は覚えておいて、読めたら描く）
  const ready = Promise.all([
    new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image()
      i.onload = () => res(i)
      i.onerror = rej
      i.src = baseUrl
    }),
    document.fonts?.load(`800 40px ${FONT}`, '0123456789+').catch(() => []) ?? Promise.resolve([]),
  ]).then(([img]) => {
    if (disposed) return
    base = img
    for (const n of pending) addClusterImage(n)
    pending.clear()
    // 絵が無いまま並べた分は、データを渡し直して並べ直させる（絵を足しただけでは並べ直さない）
    if (attached) push()
  }).catch(() => {})
  void ready

  const visibility = () => (hidden || moving ? ('none' as const) : ('visible' as const))
  const common = {
    'icon-anchor': 'bottom' as const,
    'icon-allow-overlap': true,
    'icon-ignore-placement': true,
    'symbol-z-order': 'viewport-y' as const,
  }
  const applyVisibility = () => {
    if (!attached) return
    for (const id of [ONE_LAYER, MANY_LAYER]) if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', visibility())
  }

  return {
    attach(before?: string) {
      if (attached || disposed) return
      attached = true
      map.on('styleimagemissing', onMissing)
      map.on('zoom', onZoom)
      map.addSource(CLUSTER_SOURCE, {
        type: 'geojson',
        data: dataNow(),
        cluster: true,
        clusterRadius: CLUSTER_RADIUS_PX,
        clusterMinPoints: CLUSTER_MIN_POINTS, // 3 軒以上でまとめる。2 軒以下は 1 軒ずつ
        clusterMaxZoom: CLUSTER_UNTIL_ZOOM - 1, // この倍率まではまとめ、次の整数（17）からはまとめない
        // total: まとめた店の数／doneTotal: そのうち済み／lt: ピンを持ち上げる高さの段のいちばん高いもの
        clusterProperties: { total: ['+', ['get', 'n']], doneTotal: ['+', ['get', 'done']], lt: ['max', ['get', 'lt']] } as never,
      })
      map.addLayer({
        id: ONE_LAYER, type: 'symbol', source: CLUSTER_SOURCE, maxzoom: CLUSTER_UNTIL_ZOOM,
        filter: ['all', ['!', ['has', 'point_count']], ['==', ['get', 'n'], 1]] as never,
        layout: { ...common, 'icon-image': ['concat', 'pin-', ['get', 'kind'], ['case', ['>', ['get', 'done'], 0], '-done', '']] as never, 'icon-size': ICON_SIZE as never, 'icon-offset': ICON_OFFSET as never, visibility: visibility() },
      }, before)
      map.addLayer({
        id: MANY_LAYER, type: 'symbol', source: CLUSTER_SOURCE, maxzoom: CLUSTER_UNTIL_ZOOM,
        filter: ['any', ['has', 'point_count'], ['>', ['get', 'n'], 1]] as never,
        layout: {
          ...common,
          'icon-image': ['concat', 'cl-', ['to-string', ['coalesce', ['get', 'total'], ['get', 'n']]]] as never,
          // まとめた数で 3 段（domain の clusterScale と同じ段）
          // ズームの式はいちばん外に置く決まり（MapLibre）。中で数の段を掛ける
          'icon-size': ['interpolate', ['linear'], ['zoom'], 14, ['*', 0.42, TIER], 17.5, ['*', 0.5, TIER]] as never,
          'icon-offset': MANY_OFFSET as never, // 屋根の上へ持ち上げる（1 軒のピンと同じ。まとめは中でいちばん高い段）
          visibility: visibility(),
        },
      }, before)
    },
    update(features: readonly ClusterFeature[]) {
      all = features
      if (attached) push()
    },
    setVisible(visible: boolean) {
      hidden = !visible
      applyVisibility()
    },
    setMoving(next: boolean) {
      moving = next
      applyVisibility()
    },
    // 押したもの: 1 軒の店・ビルなら、その店の id。まとめなら、ほどけるところまで寄せて [] を返す（シートは開かない）
    pick(point: { x: number; y: number }): string[] | null {
      if (!attached || hidden || map.getZoom() >= CLUSTER_UNTIL_ZOOM) return null
      const box: [[number, number], [number, number]] = [[point.x - TAP_PAD_PX, point.y - TAP_PAD_PX], [point.x + TAP_PAD_PX, point.y + TAP_PAD_PX]]
      const hit = map.queryRenderedFeatures(box, { layers: [MANY_LAYER, ONE_LAYER] })[0]
      if (!hit) return null
      const p = hit.properties as Record<string, unknown>
      if (p.cluster) {
        const center = (hit.geometry as GeoJSON.Point).coordinates as [number, number]
        const src = map.getSource(CLUSTER_SOURCE) as GeoJSONSource | undefined
        src?.getClusterExpansionZoom(Number(p.cluster_id)).then((z) => map.easeTo({ center, zoom: Math.min(Math.max(z, map.getZoom() + 1), CLUSTER_UNTIL_ZOOM + 0.01) })).catch(() => {})
        return []
      }
      return typeof p.ids === 'string' && p.ids ? p.ids.split(',') : null
    },
    dispose() {
      disposed = true
      map.off('styleimagemissing', onMissing)
      map.off('zoom', onZoom)
      for (const id of [ONE_LAYER, MANY_LAYER]) if (map.getLayer(id)) map.removeLayer(id)
      if (map.getSource(CLUSTER_SOURCE)) map.removeSource(CLUSTER_SOURCE)
      for (const id of map.listImages?.() ?? []) if (id.startsWith('cl-')) map.removeImage(id)
    },
  }
}
