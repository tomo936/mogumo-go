import { describe, expect, it } from 'vitest'
import { capModels, pickDetailed } from './lod.ts'

const none = new Set<string>()
const pick = (items: { id: string; d: number; dCam?: number; must?: boolean }[], prev: Set<string> = none, max = 40) => [...pickDetailed(items, prev, 150, 30, max)].sort()

describe('pickDetailed（どの店を詳しい模型にするか）', () => {
  it('150m 以内は詳しい・それより遠いと軽い', () => {
    expect(pick([{ id: 'a', d: 10 }, { id: 'b', d: 150 }, { id: 'c', d: 151 }])).toEqual(['a', 'b'])
  })

  it('前回詳しかった店は 179m でも詳しい・181m で軽い', () => {
    const prev = new Set(['a', 'b'])
    expect(pick([{ id: 'a', d: 179 }, { id: 'b', d: 181 }], prev)).toEqual(['a'])
  })

  it('前回軽かった店は 151m で軽いまま', () => {
    expect(pick([{ id: 'a', d: 151 }], new Set(['x']))).toEqual([])
  })

  it('上限を超えたら近い順に上限まで', () => {
    const items = Array.from({ length: 50 }, (_, i) => ({ id: `s${String(i).padStart(2, '0')}`, d: 100 - i }))
    const r = pick(items)
    expect(r).toHaveLength(40)
    expect(r).not.toContain('s00') // いちばん遠い（100m）は外れる
    expect(r).toContain('s49')
  })

  it('上限の境目では前回詳しかった店が残る', () => {
    // a は 120m・前回詳しい（実質 90m）、b は 100m・前回軽い。上限1なら a が残る
    expect(pick([{ id: 'b', d: 100 }, { id: 'a', d: 120 }], new Set(['a']), 1)).toEqual(['a'])
  })

  it('空なら空', () => {
    expect(pick([])).toEqual([])
  })

  it('カメラの真ん中から近い店も詳しい（自分から 279m でも、カメラから 10m なら詳しい）', () => {
    expect(pick([{ id: 'a', d: 279, dCam: 10 }, { id: 'b', d: 279, dCam: 200 }])).toEqual(['a'])
  })

  it('自分とカメラの近い方の距離で比べ、上限は合わせて数える', () => {
    // a: 自分から 20m、b: カメラから 30m、c: カメラから 140m。上限2なら a と b
    const items = [{ id: 'c', d: 400, dCam: 140 }, { id: 'b', d: 300, dCam: 30 }, { id: 'a', d: 20, dCam: 300 }]
    expect(pick(items, none, 2)).toEqual(['a', 'b'])
  })

  it('カメラから近い店にも余裕が効く（前回詳しければカメラから 179m でも詳しい）', () => {
    expect(pick([{ id: 'a', d: 500, dCam: 179 }], new Set(['a']))).toEqual(['a'])
  })

  it('選んだ店は遠くても必ず詳しい（上限の中に入る）', () => {
    const items = [{ id: 'a', d: 10 }, { id: 'b', d: 20 }, { id: 'sel', d: 800, must: true }]
    expect(pick(items, none, 2)).toEqual(['a', 'sel'])
  })
})

describe('capModels（模型の数の上限）', () => {
  type It = { id: string; facility: boolean; d: number }
  const it_ = (id: string, d: number, facility = false): It => ({ id, d, facility })

  it('施設は数えず全部残る', () => {
    const items = [it_('f1', 900, true), it_('a', 10), it_('f2', 800, true), it_('b', 20)]
    expect(capModels(items, 1).map((x) => x.id)).toEqual(['f1', 'a', 'f2'])
  })

  it('施設以外は近い順に上限まで（並びは元のまま）', () => {
    const items = [it_('far', 300), it_('near', 10), it_('mid', 100)]
    expect(capModels(items, 2).map((x) => x.id)).toEqual(['near', 'mid'])
  })

  it('上限ちょうどなら全部残る', () => {
    const items = [it_('a', 10), it_('b', 20), it_('c', 30)]
    expect(capModels(items, 3)).toEqual(items)
  })
})
