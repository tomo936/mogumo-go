// URL に ?debug を付けたときだけ出る「測る表示」。実機（iPhone）でビル・施設のピンが屋根からずれる原因を数字で見るためのもの。
// ?debug が無いときは何も作らず、地図のイベントも登録しない。
import type { Map as MapLibreMap } from 'maplibre-gl'
import { hasProjection } from '../../lib/threeLayer.ts'
import type { PinDebugRow } from '../../shops/infra/buildingPins.ts'

// ?debug の判定はここ1か所
export function isDebug(search: string): boolean {
  return new URLSearchParams(search).has('debug')
}

const r1 = (n: number) => (Math.round(n * 10) / 10).toString()
const xy = (p: { x: number; y: number } | null) => (p ? `${r1(p.x)},${r1(p.y)}` : '-')

// 左下の箱に出す行
export function panelLines(map: MapLibreMap, win: Window = window): string[] {
  const c = map.getCanvas()
  const box = map.getContainer()
  const vv = win.visualViewport
  return [
    `dpr ${win.devicePixelRatio}`,
    `canvas css ${c.clientWidth}x${c.clientHeight}`,
    `canvas px ${c.width}x${c.height}`,
    `container ${box.clientWidth}x${box.clientHeight}`,
    `inner ${win.innerWidth}x${win.innerHeight}`,
    `visualViewport ${vv ? `${r1(vv.width)}x${r1(vv.height)} s${r1(vv.scale)}` : '-'}`,
    `zoom ${map.getZoom().toFixed(2)} pitch ${r1(map.getPitch())} bearing ${r1(map.getBearing())}`,
    `projectAt ${hasProjection() ? 'ok' : 'まだ'}`,
  ]
}

// ピン横の小さな文字
export function rowText(r: PinDebugRow): string {
  return `top${r1(r.topM)}m lift ${xy(r.lift)} gd ${xy(r.groundDiff)} s${r.scale.toFixed(2)}`
}

const BASE = 'position:absolute;pointer-events:none;z-index:50;'
const dot = (color: string) => {
  const d = document.createElement('div')
  d.style.cssText = `${BASE}width:6px;height:6px;margin:-3px 0 0 -3px;border-radius:50%;background:${color};`
  return d
}
const tag = () => {
  const t = document.createElement('div')
  t.style.cssText = `${BASE}font:9px/1.1 monospace;color:#111;background:rgba(255,255,255,.75);padding:1px 2px;white-space:nowrap;`
  return t
}

type Item = { red: HTMLElement; blue: HTMLElement; text: HTMLElement }

export function createDebugOverlay(map: MapLibreMap, rows: () => PinDebugRow[]) {
  const box = map.getContainer()
  const root = document.createElement('div')
  root.style.cssText = `${BASE}inset:0;overflow:hidden;`
  const panel = document.createElement('pre')
  panel.style.cssText = `${BASE}left:6px;bottom:96px;margin:0;font:10px/1.25 monospace;color:#fff;background:rgba(0,0,0,.55);padding:4px 6px;border-radius:6px;white-space:pre;`
  root.appendChild(panel)
  box.appendChild(root)
  const items: Item[] = []

  const draw = () => {
    panel.textContent = panelLines(map).join('\n')
    const list = rows()
    list.forEach((r, i) => {
      let it = items[i]
      if (!it) {
        it = { red: dot('#e53935'), blue: dot('#1e88e5'), text: tag() }
        root.append(it.red, it.blue, it.text)
        items[i] = it
      }
      const bx = r.ground.x + (r.lift?.x ?? 0)
      const by = r.ground.y + (r.lift?.y ?? 0)
      it.red.style.transform = it.blue.style.transform = ''
      it.red.style.left = `${r.ground.x}px`
      it.red.style.top = `${r.ground.y}px`
      it.blue.style.left = `${bx}px`
      it.blue.style.top = `${by}px`
      it.text.style.left = `${bx + 6}px`
      it.text.style.top = `${by - 5}px`
      it.text.textContent = rowText(r)
      for (const e of [it.red, it.blue, it.text]) e.style.display = ''
    })
    for (let i = list.length; i < items.length; i++) for (const e of [items[i].red, items[i].blue, items[i].text]) e.style.display = 'none'
  }
  map.on('render', draw)
  draw()
  return {
    dispose() {
      map.off('render', draw)
      root.remove()
    },
  }
}
