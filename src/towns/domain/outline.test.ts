import { expect, test } from 'vitest'
import { inView, labelCollection, lineCollection } from './outline.ts'
import type { OutlineTown } from './outline.ts'

const sq = (x: number, y: number, s: number): OutlineTown['geom'] => ({ type: 'Polygon', coordinates: [[[x, y], [x + s, y], [x + s, y + s], [x, y + s], [x, y]]] })
const t = (id: string, x: number, cleared: boolean): OutlineTown => ({ id, name: id, geom: sq(x, 35, 0.01), bbox: [x, 35, x + 0.01, 35.01], cleared })

test('見えている範囲と重なる町だけ残す', () => {
  const list = [t('a', 139, true), t('b', 140, false)]
  expect(inView(list, [138.9, 34.9, 139.1, 35.1]).map((x) => x.id)).toEqual(['a'])
})

test('線は輪ごと（MultiPolygon も）、クリア済みかを持つ', () => {
  const multi: OutlineTown = { ...t('m', 139, false), geom: { type: 'MultiPolygon', coordinates: [(sq(139, 35, 0.01) as { coordinates: number[][][] }).coordinates, (sq(139.02, 35, 0.01) as { coordinates: number[][][] }).coordinates] } }
  const c = lineCollection([t('a', 139, true), multi])
  expect(c.features[0].properties).toEqual({ id: 'a', cleared: true })
  expect((c.features[1].geometry as { coordinates: unknown[] }).coordinates).toHaveLength(2)
})

test('名前の札は四角の真ん中', () => {
  const c = labelCollection([t('a', 139, true)])
  const g = c.features[0].geometry as { type: string; coordinates: number[] }
  expect(g.type).toBe('Point')
  expect(g.coordinates[0]).toBeCloseTo(139.005, 6)
  expect(g.coordinates[1]).toBeCloseTo(35.005, 6)
  expect(c.features[0].properties.name).toBe('a')
})
