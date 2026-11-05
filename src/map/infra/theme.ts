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
    if (src === 'building') return paint(l, { 'fill-color': t.building, 'fill-outline-color': t.buildingLine })
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
  return next
}
