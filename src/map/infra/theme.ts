import type { LayerSpecification, StyleSpecification } from 'maplibre-gl'

// 地図の色の組み合わせ。OpenFreeMap（OpenMapTiles 形式）の既成デザインに上から色を当てる
export type MapTheme = {
  ground: string
  residential: string
  park: string
  wood: string
  water: string
  waterLine: string
  building: string
  buildingLine: string
  road: string
  roadCasing: string
  path: string
  rail: string
  majorRoad: string
  majorRoadCasing: string
  label: string
  labelHalo: string
  showPlaceLabels: boolean
  showRoadLabels: boolean
  // イラスト調（2026-11-10）: 建物の色を高さで変える・建物の影・道を太く丸く
  illust?: {
    buildingFills: [string, string, string, string] // 低い → 高い（6m / 10m / 16m で区切る）
    buildingShadow: string
    roadScale: number
    majorRoadScale: number
  }
}

// 太さの式の中の数値だけを k 倍にする（zoom の補間は式のいちばん外にしか置けない決まりなので、外側に掛けられない）
export function scaleWidth(e: unknown, k: number): unknown {
  if (typeof e === 'number') return e * k
  if (!Array.isArray(e)) return e
  if (e[0] === 'interpolate') return e.map((x, i) => (i >= 4 && i % 2 === 0 ? scaleWidth(x, k) : x))
  if (e[0] === 'step') return e.map((x, i) => (i === 2 || (i > 2 && i % 2 === 1) ? scaleWidth(x, k) : x))
  return e
}

type AnyLayer = LayerSpecification & { 'source-layer'?: string; paint?: Record<string, unknown>; layout?: Record<string, unknown> }

const hide = (l: AnyLayer) => { l.layout = { ...l.layout, visibility: 'none' } }
const paint = (l: AnyLayer, values: Record<string, unknown>) => { l.paint = { ...l.paint, ...values } }

function themeLayer(l: AnyLayer, t: MapTheme) {
  const src = l['source-layer'] ?? ''
  const id = l.id
  if (l.type === 'background') return paint(l, { 'background-color': t.ground })
  if (l.type === 'fill') {
    if (src === 'water') return paint(l, { 'fill-color': t.water })
    if (src === 'park') return paint(l, { 'fill-color': t.park })
    if (src === 'landcover') return paint(l, { 'fill-color': /wood|grass|wetland/.test(id) ? t.wood : t.ground })
    if (src === 'landuse') return paint(l, { 'fill-color': t.residential })
    if (src === 'building') {
      const fills = t.illust?.buildingFills
      const color = fills ? ['step', ['coalesce', ['get', 'render_height'], 6], fills[0], 6, fills[1], 10, fills[2], 16, fills[3]] : t.building
      return paint(l, { 'fill-color': color, 'fill-outline-color': t.buildingLine })
    }
    if (src === 'aeroway') return paint(l, { 'fill-color': t.residential })
    if (src === 'transportation') return paint(l, { 'fill-color': t.road })
    return
  }
  if (l.type === 'line') {
    if (src === 'boundary') return hide(l)
    if (src === 'waterway') return paint(l, { 'line-color': t.waterLine })
    if (src === 'transportation' || src === 'aeroway') {
      // 線路は「色の線＋白い破線」の2枚重ねで模様を作っているので、破線は道路の中身の色にする
      if (/rail/.test(id)) return paint(l, { 'line-color': /dashline|hatching/.test(id) ? t.road : t.rail })
      const major = /major|motorway|trunk|primary/.test(id)
      if (t.illust && l.paint?.['line-width'] !== undefined) {
        paint(l, { 'line-width': scaleWidth(l.paint['line-width'], major ? t.illust.majorRoadScale : t.illust.roadScale) })
        l.layout = { ...l.layout, 'line-cap': 'round', 'line-join': 'round' }
      }
      if (/casing|subtle/.test(id)) return paint(l, { 'line-color': major ? t.majorRoadCasing : t.roadCasing })
      if (/path|pier/.test(id)) return paint(l, { 'line-color': t.path })
      return paint(l, { 'line-color': major ? t.majorRoad : t.road })
    }
    return
  }
  if (l.type === 'symbol') {
    if (/shield/.test(id)) return hide(l)
    if (src === 'place' && !t.showPlaceLabels) return hide(l)
    if (src === 'transportation_name' && !t.showRoadLabels) return hide(l)
    return paint(l, { 'text-color': t.label, 'text-halo-color': t.labelHalo })
  }
}

export function themeStyle(style: StyleSpecification, theme: MapTheme): StyleSpecification {
  const next = structuredClone(style)
  for (const l of next.layers) themeLayer(l as AnyLayer, theme)
  // イラスト調: 細い道にも茶色のふちを付ける（元の地図は細い道にふちの線が無い）
  if (theme.illust) {
    const m = next.layers.findIndex((l) => l.id === 'highway_minor')
    const minor = next.layers[m] as AnyLayer | undefined
    if (minor && minor.paint?.['line-width'] !== undefined) {
      next.layers.splice(m, 0, {
        ...structuredClone(minor),
        id: 'highway_minor_casing_illust',
        paint: { ...minor.paint, 'line-color': theme.roadCasing, 'line-width': scaleWidth(minor.paint['line-width'], 1.45) },
      } as LayerSpecification)
    }
  }
  // イラスト調: 建物の下に、少しずらしたやわらかい影（立体にはしない）
  if (theme.illust) {
    const i = next.layers.findIndex((l) => (l as AnyLayer)['source-layer'] === 'building')
    const b = next.layers[i] as AnyLayer | undefined
    if (b && 'source' in b) {
      next.layers.splice(i, 0, {
        id: 'building-shadow', type: 'fill', source: b.source, 'source-layer': 'building',
        paint: { 'fill-color': theme.illust.buildingShadow, 'fill-translate': [3, 5], 'fill-translate-anchor': 'viewport' },
      } as LayerSpecification)
    }
  }
  return next
}
