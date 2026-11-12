import { describe, expect, it } from 'vitest'
import { clusterMarks } from './cluster.ts'
import type { TownMark } from './cluster.ts'

const m = (id: string): TownMark => ({ id, name: id, cleared: false, lat: 0, lng: 0 })

describe('clusterMarks', () => {
  it('近い 2 つをまとめ、遠い 1 つは別にする', () => {
    const g = clusterMarks([{ mark: m('a'), x: 0, y: 0 }, { mark: m('b'), x: 10, y: 0 }, { mark: m('c'), x: 200, y: 0 }], 40)
    expect(g).toHaveLength(2)
    expect(g[0].members.map((x) => x.id)).toEqual(['a', 'b'])
    expect(g[0].x).toBe(5)
    expect(g[1].members.map((x) => x.id)).toEqual(['c'])
  })
  it('空なら空', () => {
    expect(clusterMarks([], 40)).toEqual([])
  })
})
