import type { StyleSpecification } from 'maplibre-gl'
import { expect, test } from 'vitest'
import { themeStyle } from './theme.ts'
import type { MapTheme } from './theme.ts'

const theme: MapTheme = {
  ground: '#000001', residential: '#000002', park: '#000003', wood: '#000004', water: '#000005',
  waterLine: '#000006', building: '#000007', buildingLine: '#000008', road: '#000009', roadCasing: '#00000a',
  path: '#00000b', rail: '#00000c', label: '#00000d', labelHalo: '#00000e', showPlaceLabels: true, showRoadLabels: true,
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
    { id: 'highway_path', type: 'line', source: 'x', 'source-layer': 'transportation', paint: { 'line-color': '#123' } },
    { id: 'railway', type: 'line', source: 'x', 'source-layer': 'transportation', paint: { 'line-color': '#123' } },
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

test('道路はふちと中身、歩道、線路で色を分ける', () => {
  const s = themeStyle(base(), theme)
  expect(layer(s, 'highway_major_casing').paint?.['line-color']).toBe(theme.roadCasing)
  expect(layer(s, 'highway_major_inner').paint?.['line-color']).toBe(theme.road)
  expect(layer(s, 'highway_path').paint?.['line-color']).toBe(theme.path)
  expect(layer(s, 'railway').paint?.['line-color']).toBe(theme.rail)
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
