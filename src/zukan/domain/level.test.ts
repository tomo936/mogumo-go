import { describe, expect, it } from 'vitest'
import { levelFor, needFor } from './level.ts'

describe('levelFor', () => {
  it('必要な訪問数: Lv1=0, Lv2=3, Lv3=9, Lv4=18', () => {
    expect([1, 2, 3, 4].map(needFor)).toEqual([0, 3, 9, 18])
  })
  it('0 店でも Lv1、次まで 3 店', () => {
    expect(levelFor(0)).toEqual({ level: 1, toNext: 3 })
  })
  it('3 店で Lv2、次（Lv3）まであと 6 店', () => {
    expect(levelFor(3)).toEqual({ level: 2, toNext: 6 })
  })
  it('8 店はまだ Lv2、9 店で Lv3', () => {
    expect(levelFor(8).level).toBe(2)
    expect(levelFor(9).level).toBe(3)
  })
})
