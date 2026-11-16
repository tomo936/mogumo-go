// まとめのピンの絵（「その他」のピン＋右上の丸い数字の札）。地図の絵の名前 cl-<数> を、足りないときに描いて足す。
// 描くのは shopPins の層（2026-11-16 ピンを 1 つの層にまとめた。まとめの計算は shopPins が supercluster で行う）。
import type { Map as MapLibreMap } from 'maplibre-gl'
import '@fontsource/m-plus-rounded-1c/800.css'
import baseUrl from '../../assets/pins/cluster-base.png'
import { BADGE_TEXT_FIT, BADGE_WIDEST_TEXT, badgeText } from '../domain/cluster.ts'

const FONT = '"M PLUS Rounded 1c"'
const INK = '#4a2f18'

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

// 足りない cl-<数> の絵を描いて足す。台の絵と丸い字が読めるまでの分は覚えておき、読めたら描いて onReady を呼ぶ
// （絵を足しただけでは地図が並べ直さないので、呼び出し側がデータを渡し直す）
export function createClusterImages(map: MapLibreMap, onReady: () => void) {
  let disposed = false
  let base: HTMLImageElement | null = null
  const pending = new Set<number>()
  const add = (n: number) => {
    const id = `cl-${n}`
    if (!base || map.hasImage(id)) return
    map.addImage(id, drawCluster(base, n), { pixelRatio: 2 })
  }
  const onMissing = (e: { id: string }) => {
    const m = /^cl-(\d+)$/.exec(e.id)
    if (!m) return
    if (base) add(Number(m[1]))
    else pending.add(Number(m[1]))
  }
  map.on('styleimagemissing', onMissing)
  void Promise.all([
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
    for (const n of pending) add(n)
    pending.clear()
    onReady()
  }).catch(() => {})
  return {
    dispose() {
      disposed = true
      map.off('styleimagemissing', onMissing)
      for (const id of map.listImages?.() ?? []) if (id.startsWith('cl-')) map.removeImage(id)
    },
  }
}
