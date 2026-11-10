import { describe, expect, it } from 'vitest'
import { EXP_NEW, EXP_REVISIT, expFromCounts, expFromShopIds, levelFor, needFor } from './level.ts'

describe('経験値とレベル', () => {
  it('必要な経験値: Lv1=0, Lv2=30, Lv3=90, Lv4=180, Lv5=300', () => {
    expect([1, 2, 3, 4, 5].map(needFor)).toEqual([0, 30, 90, 180, 300])
  })
  it('新しいお店 +10、もう一度 +2', () => {
    expect(EXP_NEW).toBe(10)
    expect(EXP_REVISIT).toBe(2)
    expect(expFromCounts([1, 3, 0])).toBe(10 + (10 + 4))
    expect(expFromShopIds(['a', 'b', 'a', 'a'])).toBe(10 + (10 + 4))
  })
  it('0 でも Lv1、次まであと 30', () => {
    expect(levelFor(0)).toEqual({ level: 1, into: 0, span: 30, toNext: 30 })
  })
  it('30 で Lv2（次まであと 60・今のレベルで 0/60）、29 はまだ Lv1', () => {
    expect(levelFor(29).level).toBe(1)
    expect(levelFor(30)).toEqual({ level: 2, into: 0, span: 60, toNext: 60 })
    expect(levelFor(90).level).toBe(3)
  })
})
