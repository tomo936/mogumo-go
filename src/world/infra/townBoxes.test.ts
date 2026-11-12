import { expect, test } from 'vitest'
import { loadTownBoxes } from './townBoxes.ts'
import type { TownsClient } from '../../towns/infra/townsApi.ts'

const client = (rows: unknown): TownsClient =>
  ({ from: () => ({ select: () => ({ in: async () => (rows instanceof Error ? { data: null, error: rows } : { data: rows, error: null }) }) }) }) as unknown as TownsClient

test('四角が読めない町は旗を出さないだけで、ほかは出る', async () => {
  const m = await loadTownBoxes(['a', 'b'], client([
    { town_id: 'a', min_lat: 1, max_lat: 2, min_lng: 3, max_lng: 4 },
    { town_id: 'b', min_lat: null, max_lat: 2, min_lng: 3, max_lng: 4 },
  ]))
  expect([...m.keys()]).toEqual(['a'])
  expect(m.get('a')).toEqual({ minLat: 1, maxLat: 2, minLng: 3, maxLng: 4 })
})

test('読めなければ throw', async () => {
  await expect(loadTownBoxes(['a'], client(new Error('x')))).rejects.toThrow('towns_unavailable')
})
