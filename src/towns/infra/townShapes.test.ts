import { expect, test } from 'vitest'
import { loadTownShapes } from './townsApi.ts'
import type { TownsClient } from './townsApi.ts'

const poly = { type: 'Polygon', coordinates: [[[1, 1], [2, 1], [2, 2], [1, 1]]] }
const client = (rows: (ids: string[]) => unknown, calls: string[][] = []): TownsClient =>
  ({ from: () => ({ select: () => ({ in: async (_c: string, ids: string[]) => { calls.push(ids); const r = rows(ids); return r instanceof Error ? { data: null, error: r } : { data: r, error: null } } }) }) }) as unknown as TownsClient

test('名前と形を読む。形が読めない行は飛ばす', async () => {
  const m = await loadTownShapes(['a', 'b'], client(() => [{ town_id: 'a', name: '経堂', boundary: poly }, { town_id: 'b', name: 'x', boundary: { type: 'Point' } }]))
  expect([...m.keys()]).toEqual(['a'])
  expect(m.get('a')?.name).toBe('経堂')
  expect(m.get('a')?.bbox).toEqual([1, 1, 2, 2])
})

test('100件ずつに分けて聞く', async () => {
  const calls: string[][] = []
  await loadTownShapes(Array.from({ length: 250 }, (_, i) => `t${i}`), client(() => [], calls))
  expect(calls.map((c) => c.length)).toEqual([100, 100, 50])
})

test('読めなければ throw', async () => {
  await expect(loadTownShapes(['a'], client(() => new Error('x')))).rejects.toThrow('towns_unavailable')
})
