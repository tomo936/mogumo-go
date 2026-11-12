import { describe, expect, it } from 'vitest'
import { fitSize, nextAttempt } from './photoFit.ts'

describe('fitSize', () => {
  it('長い辺を maxSide に縮め、縦横比を保つ', () => {
    expect(fitSize(4032, 3024, 1080)).toEqual({ w: 1080, h: 810 })
    expect(fitSize(3024, 4032, 1080)).toEqual({ w: 810, h: 1080 })
  })
  it('小さければそのまま', () => {
    expect(fitSize(800, 600, 1080)).toEqual({ w: 800, h: 600 })
  })
})

describe('nextAttempt', () => {
  it('品質を 0.06 ずつ下げる', () => {
    const n = nextAttempt({ quality: 0.82, scale: 1 })
    expect(n?.quality).toBeCloseTo(0.76)
    expect(n?.scale).toBe(1)
  })
  it('0.5 を下回るなら品質を戻して 0.85 倍', () => {
    const n = nextAttempt({ quality: 0.52, scale: 1 })
    expect(n).toEqual({ quality: 0.82, scale: 0.85 })
  })
  it('scale が 0.3 を下回るなら null', () => {
    expect(nextAttempt({ quality: 0.52, scale: 0.31 })).toBeNull()
  })
})
