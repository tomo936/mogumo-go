import { expect, test, vi } from 'vitest'
import type { StyleSpecification } from 'maplibre-gl'
import { recolor } from './theme.ts'
import { THEMES } from './themes.ts'

test('昼と夜の切り替え: 地図を作り直さず、変わった色だけを当てる', () => {
  const style = {
    version: 8,
    sources: {},
    layers: [
      { id: 'background', type: 'background', paint: { 'background-color': THEMES.illust.ground } },
      { id: 'water', type: 'fill', source: 'x', 'source-layer': 'water', paint: { 'fill-color': THEMES.illust.water } },
    ],
  } as unknown as StyleSpecification
  const paint = new Map<string, unknown>([['background/background-color', THEMES.illust.ground], ['water/fill-color', THEMES.illust.water]])
  const map = {
    getStyle: () => style,
    getLayer: (id: string) => style.layers.find((l) => l.id === id),
    getPaintProperty: (id: string, k: string) => paint.get(`${id}/${k}`),
    setPaintProperty: vi.fn((id: string, k: string, v: unknown) => void paint.set(`${id}/${k}`, v)),
  }
  recolor(map, THEMES.illustNight)
  expect(paint.get('background/background-color')).toBe(THEMES.illustNight.ground)
  expect(paint.get('water/fill-color')).toBe(THEMES.illustNight.water)
  map.setPaintProperty.mockClear()
  recolor(map, THEMES.illustNight) // 同じ色ならもう当てない
  expect(map.setPaintProperty).not.toHaveBeenCalled()
})
