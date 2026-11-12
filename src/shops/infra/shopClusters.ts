// 引いた地図でピンをまとめる層（ズーム 17.5 より引いたときだけ。MapLibre の cluster）。2026-11-13 オーナー（案A）。
// 1 軒の店は今と同じ種類のピン、2 軒以上（まとめ・ビル）は「その他」のピンの右上に丸い数字の札を 1 枚の絵として描く
// （数字はいつも丸の真ん中。桁が増えたら字を小さく、100 以上は 99+）。寄ったら shopPins とビルのピンに任せる。
import type { GeoJSONSource, Map as MapLibreMap } from 'maplibre-gl'
import '@fontsource/m-plus-rounded-1c/800.css'
import baseUrl from '../../assets/pins/cluster-base.png'
import { badgeFontRatio, badgeText, CLUSTER_RADIUS_PX, CLUSTER_UNTIL_ZOOM, clusterScale } from '../domain/cluster.ts'
import type { ClusterFeature } from '../domain/cluster.ts'

export const CLUSTER_SOURCE = 'shop-clusters'
const ONE_LAYER = 'shop-clusters-one'
const MANY_LAYER = 'shop-clusters-many'
const TAP_PAD_PX = 8
const FONT = '"M PLUS Rounded 1c"'
const INK = '#4a2f18'
const TIER = ['step', ['coalesce', ['get', 'total'], ['get', 'n']], clusterScale(2), 10, clusterScale(10), 30, clusterScale(30)] as const
const ICON_SIZE = ['interpolate', ['linear'], ['zoom'], 14, 0.2, 16, 0.22, 18, 0.29] as const // 1 軒のピン（shopPins と同じ大きさ）

// まとめのピンの絵（256px の台＋右上の丸い札）。pixelRatio 2 で使う
function drawCluster(base: HTMLImageElement, n: number): ImageData {
  const W = 360, H = 320, PIN = 256
  const cv = document.createElement('canvas')
  cv.width = W
  cv.height = H
  const c = cv.getContext('2d')!
  const px = (W - PIN) / 2, py = H - PIN // ピンの先が絵の下の真ん中
  c.drawImage(base, px, py, PIN, PIN)
  const D = 100, r = D / 2
  const cx = px + PIN - 34, cy = py + 18 // 札の中心（ピンの右上にかかる）
  c.fillStyle = INK
  c.beginPath(); c.arc(cx + 4, cy + 5, r, 0, Math.PI * 2); c.fill() // 平らな影
  c.fillStyle = '#ff7a3d'
  c.beginPath(); c.arc(cx, cy, r, 0, Math.PI * 2); c.fill()
  c.lineWidth = 7; c.strokeStyle = '#fff'; c.stroke()
  c.lineWidth = 3; c.strokeStyle = INK
  c.beginPath(); c.arc(cx, cy, r + 4, 0, Math.PI * 2); c.stroke()
  const text = badgeText(n)
  c.fillStyle = '#fff'
  c.textAlign = 'center'
  c.textBaseline = 'middle'
  c.font = `800 ${Math.round(D * badgeFontRatio(text))}px ${FONT}`
  c.fillText(text, cx, cy + 3)
  return c.getImageData(0, 0, W, H)
}

export function createShopClusters(map: MapLibreMap) {
  let attached = false
  let disposed = false
  let hidden = false
  let moving = false
  let data: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] }
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
    if (attached) (map.getSource(CLUSTER_SOURCE) as GeoJSONSource | undefined)?.setData(data)
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
      map.addSource(CLUSTER_SOURCE, {
        type: 'geojson',
        data,
        cluster: true,
        clusterRadius: CLUSTER_RADIUS_PX,
        clusterMaxZoom: Math.floor(CLUSTER_UNTIL_ZOOM),
        clusterProperties: { total: ['+', ['get', 'n']], doneTotal: ['+', ['get', 'done']] } as never,
      })
      map.addLayer({
        id: ONE_LAYER, type: 'symbol', source: CLUSTER_SOURCE, maxzoom: CLUSTER_UNTIL_ZOOM,
        filter: ['all', ['!', ['has', 'point_count']], ['==', ['get', 'n'], 1]] as never,
        layout: { ...common, 'icon-image': ['concat', 'pin-', ['get', 'kind'], ['case', ['>', ['get', 'done'], 0], '-done', '']] as never, 'icon-size': ICON_SIZE as never, visibility: visibility() },
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
          visibility: visibility(),
        },
      }, before)
    },
    update(features: readonly ClusterFeature[]) {
      data = { type: 'FeatureCollection', features: features as unknown as GeoJSON.Feature[] }
      if (attached) (map.getSource(CLUSTER_SOURCE) as GeoJSONSource | undefined)?.setData(data)
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
      for (const id of [ONE_LAYER, MANY_LAYER]) if (map.getLayer(id)) map.removeLayer(id)
      if (map.getSource(CLUSTER_SOURCE)) map.removeSource(CLUSTER_SOURCE)
      for (const id of map.listImages?.() ?? []) if (id.startsWith('cl-')) map.removeImage(id)
    },
  }
}
