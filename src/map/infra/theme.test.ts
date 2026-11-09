import type { StyleSpecification } from 'maplibre-gl'
import { expect, test } from 'vitest'
import { themeStyle } from './theme.ts'
import type { MapTheme } from './theme.ts'

const theme: MapTheme = {
  ground: '#000001', residential: '#000002', park: '#000003', wood: '#000004', water: '#000005',
  waterLine: '#000006', building: '#000007', buildingLine: '#000008', road: '#000009', roadCasing: '#00000a',
  path: '#00000b', rail: '#00000c', majorRoad: '#00000f', majorRoadCasing: '#000010', label: '#00000d', labelHalo: '#00000e', showPlaceLabels: true, showRoadLabels: true,
}

const base = (): StyleSpecification => ({
  version: 8,
  sources: {},
  layers: [
    { id: 'background', type: 'background', paint: { 'background-color': '#fff' } },
    { id: 'water', type: 'fill', source: 'x', 'source-layer': 'water', paint: { 'fill-color': '#123' } },
    { id: 'park', type: 'fill', source: 'x', 'source-layer': 'park', paint: { 'fill-color': '#123' } },
    { id: 'landcover_wood', type: 'fill', source: 'x', 'source-layer': 'landcover', paint: { 'fill-color': '#123' } },
    { id: 'building', type: 'fill', source: 'x', 'source-layer': 'building', paint: { 'fill-color': '#123' } },
    { id: 'highway_major_casing', type: 'line', source: 'x', 'source-layer': 'transportation', paint: { 'line-color': '#123' } },
    { id: 'highway_major_inner', type: 'line', source: 'x', 'source-layer': 'transportation', paint: { 'line-color': '#123' } },
    { id: 'highway_motorway_inner', type: 'line', source: 'x', 'source-layer': 'transportation', paint: { 'line-color': '#123' } },
    { id: 'highway_motorway_bridge_casing', type: 'line', source: 'x', 'source-layer': 'transportation', paint: { 'line-color': '#123' } },
    { id: 'highway_minor', type: 'line', source: 'x', 'source-layer': 'transportation', paint: { 'line-color': '#123' } },
    { id: 'highway_path', type: 'line', source: 'x', 'source-layer': 'transportation', paint: { 'line-color': '#123' } },
    { id: 'railway', type: 'line', source: 'x', 'source-layer': 'transportation', paint: { 'line-color': '#123' } },
    { id: 'railway_dashline', type: 'line', source: 'x', 'source-layer': 'transportation', paint: { 'line-color': '#fff', 'line-opacity': 0.5 } },
    { id: 'boundary_2', type: 'line', source: 'x', 'source-layer': 'boundary', paint: { 'line-color': '#123' } },
    { id: 'highway-shield-non-us', type: 'symbol', source: 'x', 'source-layer': 'transportation_name' },
    { id: 'highway-name-major', type: 'symbol', source: 'x', 'source-layer': 'transportation_name', paint: { 'text-color': '#123' } },
    { id: 'label_town', type: 'symbol', source: 'x', 'source-layer': 'place', paint: { 'text-color': '#123' } },
  ],
})

const layer = (s: StyleSpecification, id: string) => s.layers.find((l) => l.id === id) as unknown as {
  paint?: Record<string, unknown>; layout?: Record<string, unknown>
}

test('地面・水・公園・森・建物の色を変える', () => {
  const s = themeStyle(base(), theme)
  expect(layer(s, 'background').paint?.['background-color']).toBe(theme.ground)
  expect(layer(s, 'water').paint?.['fill-color']).toBe(theme.water)
  expect(layer(s, 'park').paint?.['fill-color']).toBe(theme.park)
  expect(layer(s, 'landcover_wood').paint?.['fill-color']).toBe(theme.wood)
  expect(layer(s, 'building').paint?.['fill-color']).toBe(theme.building)
  expect(layer(s, 'building').paint?.['fill-outline-color']).toBe(theme.buildingLine)
})

test('道路は大きい道・ふつうの道・歩道・線路で色を分ける', () => {
  const s = themeStyle(base(), theme)
  expect(layer(s, 'highway_minor').paint?.['line-color']).toBe(theme.road)
  expect(layer(s, 'highway_major_casing').paint?.['line-color']).toBe(theme.majorRoadCasing)
  expect(layer(s, 'highway_major_inner').paint?.['line-color']).toBe(theme.majorRoad)
  expect(layer(s, 'highway_motorway_inner').paint?.['line-color']).toBe(theme.majorRoad)
  expect(layer(s, 'highway_motorway_bridge_casing').paint?.['line-color']).toBe(theme.majorRoadCasing)
  expect(layer(s, 'highway_path').paint?.['line-color']).toBe(theme.path)
  expect(layer(s, 'railway').paint?.['line-color']).toBe(theme.rail)
})

test('線路の破線は道路の中身の色にして、線路の模様を残す。ほかの paint はそのまま', () => {
  const s = themeStyle(base(), theme)
  expect(layer(s, 'railway_dashline').paint?.['line-color']).toBe(theme.road)
  expect(layer(s, 'railway_dashline').paint?.['line-opacity']).toBe(0.5)
})

test('境界線と道路番号の看板は消し、文字は色をそろえる', () => {
  const s = themeStyle(base(), theme)
  expect(layer(s, 'boundary_2').layout?.visibility).toBe('none')
  expect(layer(s, 'highway-shield-non-us').layout?.visibility).toBe('none')
  expect(layer(s, 'highway-name-major').paint?.['text-color']).toBe(theme.label)
  expect(layer(s, 'label_town').paint?.['text-halo-color']).toBe(theme.labelHalo)
})

test('地名・道路名を出さない設定なら消す', () => {
  const s = themeStyle(base(), { ...theme, showPlaceLabels: false, showRoadLabels: false })
  expect(layer(s, 'label_town').layout?.visibility).toBe('none')
  expect(layer(s, 'highway-name-major').layout?.visibility).toBe('none')
})

test('元のデザインは書き換えない', () => {
  const original = base()
  themeStyle(original, theme)
  expect(layer(original, 'water').paint?.['fill-color']).toBe('#123')
})

// ---- イラスト調（2026-11-10） ----
const illust: MapTheme = {
  ...theme,
  illust: { buildingFills: ['#a00001', '#a00002', '#a00003', '#a00004'], buildingShadow: 'rgba(1,2,3,0.5)', roadScale: 2, majorRoadScale: 1.5 },
}
const widthBase = (): StyleSpecification => {
  const s = base()
  for (const l of s.layers) {
    if (l.id === 'highway_minor') (l as { paint: Record<string, unknown> }).paint['line-width'] = ['interpolate', ['exponential', 1.2], ['zoom'], 13, 1, 20, 10]
    if (l.id === 'highway_major_inner') (l as { paint: Record<string, unknown> }).paint['line-width'] = 4
  }
  return s
}

test('イラスト調: 建物の色を高さで変え、建物の下にずらした影を入れる', () => {
  const s = themeStyle(base(), illust)
  expect(layer(s, 'building').paint?.['fill-color']).toEqual(['step', ['coalesce', ['get', 'render_height'], 6], '#a00001', 6, '#a00002', 10, '#a00003', 16, '#a00004'])
  const ids = s.layers.map((l) => l.id)
  expect(ids.indexOf('building-shadow')).toBe(ids.indexOf('building') - 1)
  expect(layer(s, 'building-shadow').paint?.['fill-translate']).toEqual([3, 5])
})

test('イラスト調: 道の太さを式の中の数値だけ大きくし、端を丸くする（zoom の補間は外側のまま）', () => {
  const s = themeStyle(widthBase(), illust)
  expect(layer(s, 'highway_minor').paint?.['line-width']).toEqual(['interpolate', ['exponential', 1.2], ['zoom'], 13, 2, 20, 20])
  expect(layer(s, 'highway_major_inner').paint?.['line-width']).toBe(6)
  expect(layer(s, 'highway_minor').layout?.['line-cap']).toBe('round')
})

test('イラスト調でない色の案は、太さも建物の影も今のまま', () => {
  const s = themeStyle(widthBase(), theme)
  expect(layer(s, 'highway_minor').paint?.['line-width']).toEqual(['interpolate', ['exponential', 1.2], ['zoom'], 13, 1, 20, 10])
  expect(s.layers.some((l) => l.id === 'building-shadow')).toBe(false)
})

test('イラスト調: 細い道の下に、茶色のふちの線を足す（太さは 1.45 倍）', () => {
  const s = themeStyle(widthBase(), illust)
  const ids = s.layers.map((l) => l.id)
  expect(ids.indexOf('highway_minor_casing_illust')).toBe(ids.indexOf('highway_minor') - 1)
  expect(layer(s, 'highway_minor_casing_illust').paint?.['line-color']).toBe(illust.roadCasing)
  expect(layer(s, 'highway_minor_casing_illust').paint?.['line-width']).toEqual(['interpolate', ['exponential', 1.2], ['zoom'], 13, 2.9, 20, 29])
})
