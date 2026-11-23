// まとめのピンの絵（「その他」のピン＋右上の丸い数字の札）。地図の絵の名前 cl-<数> を、足りないときに描いて足す。
// 描くのは shopPins の層（2026-11-16 ピンを 1 つの層にまとめた。まとめの計算は shopPins が supercluster で行う）。
import type { Map as MapLibreMap } from 'maplibre-gl'
import '@fontsource/m-plus-rounded-1c/800.css'
import baseUrl from '../../assets/pins/cluster-base.png'
import { BADGE_TEXT_FIT, BADGE_WIDEST_TEXT, badgeText } from '../domain/cluster.ts'

const FONT = '"M PLUS Rounded 1c"'
const INK = '#4a2f18'

// まとめのピンの絵（オーナーの台の絵 art/pins/cluster-frame.png → cluster-base.png 256px。2026-11-16「数字を真ん中、料理アイコンは消す」）。
// クリーム色の丸のちょうど真ん中に、こげ茶の太い数字。字の大きさは桁によらず同じ（「99+」が丸に収まる大きさ）。pixelRatio 2 で使う
const CIRCLE = { x: 127.8, y: 103.5, r: 84 } // 丸の真ん中と半径（art/prototypes/cluster-base.py で測った値）
export function drawCluster(base: CanvasImageSource, n: number): ImageData {
  const S = 256
  const cv = document.createElement('canvas')
  cv.width = S
  cv.height = S
  // 読み出し（getImageData）前提の絵なので、GPU ではなく CPU 側に置く。GPU に置くと読み出しのたびに地図の描画を待ち、
  // 1 回に数百 ms〜数秒かかっていた（2026-11-24 測定 scripts/e2e/s30.mjs）
  const c = cv.getContext('2d', { willReadFrequently: true })!
  c.drawImage(base, 0, 0, S, S)
  // 字の大きさ: 「99+」の幅が丸の直径の BADGE_TEXT_FIT に収まる大きさ（全部の数で同じ）
  c.font = `800 100px ${FONT}`
  const size = Math.min(110, Math.floor((100 * 2 * CIRCLE.r * BADGE_TEXT_FIT) / c.measureText(BADGE_WIDEST_TEXT).width))
  c.font = `800 ${size}px ${FONT}`
  const text = badgeText(n)
  const m = c.measureText(text)
  const x = CIRCLE.x - (m.actualBoundingBoxRight - m.actualBoundingBoxLeft) / 2 // 左端 x−L・右端 x＋R の真ん中を丸の真ん中に
  const y = CIRCLE.y + (m.actualBoundingBoxAscent - m.actualBoundingBoxDescent) / 2
  c.textAlign = 'left'
  c.textBaseline = 'alphabetic'
  c.fillStyle = INK
  c.fillText(text, x, y)
  return c.getImageData(0, 0, S, S)
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
