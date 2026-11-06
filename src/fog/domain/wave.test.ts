import { describe, expect, it } from 'vitest'
import { thinAmount, waveClumps } from './wave.ts'
import { WAVE_SPEED_MPS } from '../config.ts'

const a = { x: 0, y: 0, w: 30, seed: 0.1 }
const b = { x: 100, y: 0, w: 30, seed: 0.2 }

describe('waveClumps', () => {
  it('消えた塊は w1=0 で、距離に応じて始まりが遅れる', () => {
    const [r] = waveClumps([b], [], { x: 0, y: 0 }, 10)
    expect(r.w1).toBe(0)
    expect(r.start).toBeCloseTo(10 + 100 / WAVE_SPEED_MPS)
  })
  it('変わらない塊は start=-1', () => {
    const r = waveClumps([a], [{ ...a }], { x: 0, y: 0 }, 10)
    expect(r[0].start).toBe(-1)
    expect(r[0].w1).toBe(30)
  })
  it('縮んだ塊は w1 が新しい w', () => {
    const [r] = waveClumps([a], [{ ...a, w: 12 }], { x: 0, y: 0 }, 5)
    expect(r.w1).toBe(12)
    expect(r.start).toBeGreaterThanOrEqual(5)
  })
})

describe('thinAmount', () => {
  it('遠いと 0、近いと 1、間はなめらか', () => {
    expect(thinAmount(60)).toBe(0)
    expect(thinAmount(25)).toBe(1)
    const m = thinAmount(40)
    expect(m).toBeGreaterThan(0)
    expect(m).toBeLessThan(1)
  })
})
