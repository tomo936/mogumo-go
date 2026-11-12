import { describe, expect, it } from 'vitest'
import { AVATAR_HEIGHT_M, AVATAR_MIN_PX, AVATAR_RATE_MAX, AVATAR_RATE_MIN } from '../config.ts'
import { BLINK_TOTAL_MS, avatarHeightMeters, blinkFrame, initialMotion, joyDurationMs, motionFor, nextBlinkDelay, playbackRate, stepMotion } from './avatar3d.ts'
import type { MotionState } from './avatar3d.ts'
import { metersPerPixel } from './geo.ts'

describe('avatarHeightMeters', () => {
  it('ふだんは地図の上で 20m に固定（ズーム・傾きで変えない）', () => {
    for (const z of [16, 16.5, 17, 18]) expect(avatarHeightMeters(z, 35)).toBe(AVATAR_HEIGHT_M)
  })
  it('ズーム 17 では画面で約 40px（今の 2D と同じくらい）', () => {
    expect(AVATAR_HEIGHT_M / metersPerPixel(17, 35)).toBeCloseTo(41, 0)
  })
  it('引いて画面で 16px を下回るところでは 16px で止まる', () => {
    for (const z of [13, 14, 15]) expect(avatarHeightMeters(z, 35) / metersPerPixel(z, 35)).toBeCloseTo(AVATAR_MIN_PX, 6)
  })
})

describe('motionFor', () => {
  it('0.4m/秒以下は待機、2.0m/秒以上は走り、その間は歩き', () => {
    expect(motionFor(0)).toBe('idle')
    expect(motionFor(0.4)).toBe('idle')
    expect(motionFor(0.41)).toBe('walk')
    expect(motionFor(1.99)).toBe('walk')
    expect(motionFor(2)).toBe('run')
  })
})

const run = (s: MotionState, speed: number, ms: number, step = 16) => {
  for (let t = 0; t < ms; t += step) s = stepMotion(s, speed, step)
  return s
}

describe('stepMotion', () => {
  it('速さが 1 秒続いてから替える', () => {
    expect(run(initialMotion, 1.2, 900).shown).toBe('idle')
    expect(run(initialMotion, 1.2, 1010).shown).toBe('walk')
  })
  it('途中で戻ると数え直す（行ったり来たりしない）', () => {
    let s = run(initialMotion, 1.2, 800)
    s = run(s, 0, 100)
    s = run(s, 1.2, 800)
    expect(s.shown).toBe('idle')
  })
  it('別の動きへ向かい直したら、その動きで数え直す', () => {
    let s = run(initialMotion, 1.2, 800)
    s = run(s, 3, 500)
    expect(s.shown).toBe('idle')
    expect(run(s, 3, 520).shown).toBe('run')
  })
})

describe('playbackRate', () => {
  it('待機は 1 倍', () => expect(playbackRate('idle', 0)).toBe(1))
  it('速いほど速く、範囲に収める', () => {
    expect(playbackRate('walk', 1.0)).toBeLessThan(playbackRate('walk', 1.5))
    expect(playbackRate('walk', 0.41)).toBe(AVATAR_RATE_MIN)
    expect(playbackRate('walk', 1.99)).toBeLessThanOrEqual(AVATAR_RATE_MAX)
    expect(playbackRate('run', 30)).toBe(AVATAR_RATE_MAX)
    expect(playbackRate('run', 2)).toBeGreaterThanOrEqual(AVATAR_RATE_MIN)
  })
})

describe('まばたき', () => {
  it('間隔は 2〜6 秒', () => {
    expect(nextBlinkDelay(0)).toBe(2000)
    expect(nextBlinkDelay(1)).toBe(6000)
  })
  it('0→1（0.04 秒）→2（0.07 秒）→1（0.04 秒）→0', () => {
    expect(blinkFrame(-1)).toBe(0)
    expect(blinkFrame(0)).toBe(1)
    expect(blinkFrame(39)).toBe(1)
    expect(blinkFrame(40)).toBe(2)
    expect(blinkFrame(109)).toBe(2)
    expect(blinkFrame(110)).toBe(1)
    expect(blinkFrame(149)).toBe(1)
    expect(blinkFrame(150)).toBe(0)
    expect(BLINK_TOTAL_MS).toBe(150)
  })
})

it('うれしいは 0.8 秒 × 2 回 = 1.6 秒', () => {
  expect(joyDurationMs(0.8, 2)).toBeCloseTo(1600, 6)
})
