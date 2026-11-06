// 雲海（地面に敷く雲の模様）。晴れたセルの所をやわらかい縁でくり抜き、canvas として地図に貼る
import type { CanvasSource, Map as MapLibreMap } from 'maplibre-gl'
import { CELL_M, REF_LAT_DEG, SEA_HALF_M, SEA_TILE_M } from '../config.ts'
import type { LatLng } from '../../map/domain/geo.ts'
import { clearedCenters } from '../domain/clearing.ts'
import type { Cleared } from '../domain/clearing.ts'
import { M_PER_DEG_LAT } from '../domain/grid.ts'
import seaUrl from '../../assets/fog/cloud-sea-pattern.png'

type Corner = [number, number]
const ID = 'fog-sea'
const SIZE = 2048 // canvas の一辺（3km で 約1.5m/px）
const FALLBACK = '#f4f8fc' // 模様が読めるまで（読めなかったとき）の淡い雲の色
// 模様の1枚を世界に固定する刻み（セルと同じく経度は北緯35度の幅）。作り直しても模様がずれない
const TILE_LAT = SEA_TILE_M / M_PER_DEG_LAT
const TILE_LNG = SEA_TILE_M / (M_PER_DEG_LAT * Math.cos((REF_LAT_DEG * Math.PI) / 180))

// 北西・北東・南東・南西の [lng, lat]
export function seaBounds(center: LatLng, halfM: number): [Corner, Corner, Corner, Corner] {
  const dLat = halfM / M_PER_DEG_LAT
  const dLng = halfM / (M_PER_DEG_LAT * Math.cos((center.lat * Math.PI) / 180))
  const n = center.lat + dLat
  const s = center.lat - dLat
  const w = center.lng - dLng
  const e = center.lng + dLng
  return [[w, n], [e, n], [e, s], [w, s]]
}

function draw(canvas: HTMLCanvasElement, img: HTMLImageElement | null, bounds: [Corner, Corner, Corner, Corner], cleared: Cleared) {
  const g = canvas.getContext('2d')
  if (!g) return
  g.globalCompositeOperation = 'source-over'
  g.clearRect(0, 0, SIZE, SIZE)
  const [[w, n], , [e, s]] = bounds
  const pxLng = SIZE / (e - w)
  const pxLat = SIZE / (n - s)
  const X = (lng: number) => (lng - w) * pxLng
  const Y = (lat: number) => (n - lat) * pxLat
  const tw = TILE_LNG * pxLng
  const th = TILE_LAT * pxLat
  if (img) {
    for (let lat = Math.ceil(n / TILE_LAT) * TILE_LAT; Y(lat) < SIZE; lat -= TILE_LAT) {
      for (let lng = Math.floor(w / TILE_LNG) * TILE_LNG; X(lng) < SIZE; lng += TILE_LNG) {
        g.drawImage(img, X(lng), Y(lat), tw + 1, th + 1)
      }
    }
  } else {
    g.fillStyle = FALLBACK
    g.fillRect(0, 0, SIZE, SIZE)
  }
  // 晴れたセルの中心に、ふちのやわらかい円の穴
  g.globalCompositeOperation = 'destination-out'
  const r = (CELL_M / M_PER_DEG_LAT) * pxLat
  for (const c of clearedCenters(cleared)) {
    const cx = X(c.lng)
    const cy = Y(c.lat)
    if (cx < -r || cy < -r || cx > SIZE + r || cy > SIZE + r) continue
    const gr = g.createRadialGradient(cx, cy, r * 0.6, cx, cy, r)
    gr.addColorStop(0, 'rgba(0,0,0,1)')
    gr.addColorStop(1, 'rgba(0,0,0,0)')
    g.fillStyle = gr
    g.beginPath()
    g.arc(cx, cy, r, 0, Math.PI * 2)
    g.fill()
  }
}

// beforeId: この層より下に入れる（自分の位置の印を霧で隠さない）
export function addSea(map: MapLibreMap, center: LatLng, cleared: Cleared, beforeId?: string): { update(center: LatLng, cleared: Cleared): void; remove(): void } {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = SIZE
  let img: HTMLImageElement | null = null
  let bounds = seaBounds(center, SEA_HALF_M)
  let last = cleared
  let removed = false
  draw(canvas, img, bounds, cleared)
  map.addSource(ID, { type: 'canvas', canvas, coordinates: bounds, animate: false })
  map.addLayer({ id: ID, type: 'raster', source: ID, paint: { 'raster-fade-duration': 0 } }, beforeId)

  // 描き直した canvas を地図に送る（静止画の canvas は play → pause で1回だけ読み直す）
  const refresh = () => {
    const src = map.getSource<CanvasSource>(ID)
    if (!src) return
    src.setCoordinates(bounds)
    src.play()
    src.pause()
  }

  const loading = new Image()
  loading.src = seaUrl
  loading
    .decode()
    .then(() => {
      if (removed) return
      img = loading
      draw(canvas, img, bounds, last)
      refresh()
    })
    .catch(() => {}) // 模様が読めなければ淡い雲の色のまま

  return {
    update(c, cl) {
      bounds = seaBounds(c, SEA_HALF_M)
      last = cl
      draw(canvas, img, bounds, cl)
      refresh()
    },
    remove() {
      removed = true
      if (map.getLayer(ID)) map.removeLayer(ID)
      if (map.getSource(ID)) map.removeSource(ID)
      canvas.width = canvas.height = 0 // 2048px の canvas のメモリを返す（iOS は canvas の総量に上限がある）
    },
  }
}
