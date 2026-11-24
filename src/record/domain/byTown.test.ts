import { expect, test } from 'vitest'
import { groupByTown } from './byTown.ts'

const square = (x0: number, y0: number) => ({ type: 'Polygon' as const, coordinates: [[[x0, y0], [x0 + 1, y0], [x0 + 1, y0 + 1], [x0, y0 + 1], [x0, y0]]] })
const towns = [
  { id: 'a', name: '経堂', geom: square(139, 35), bbox: [139, 35, 140, 36] as [number, number, number, number] },
  { id: 'b', name: '赤堤', geom: square(141, 35), bbox: [141, 35, 142, 36] as [number, number, number, number] },
]

test('町の形に入るお店をまとめ、回数の多い町から。入らないお店は「そのほか」で最後', () => {
  const g = groupByTown([
    { n: 1, lat: 35.5, lng: 141.5 },
    { n: 2, lat: 35.5, lng: 139.5 },
    { n: 3, lat: 35.2, lng: 139.2 },
    { n: 4, lat: null, lng: null },
  ], towns)
  expect(g.map((x) => x.name)).toEqual(['経堂', '赤堤', 'そのほか'])
  expect(g[0].items.map((x) => x.n)).toEqual([2, 3])
  expect(g[2].items.map((x) => x.n)).toEqual([4])
})
