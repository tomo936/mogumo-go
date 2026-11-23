import { expect, test } from 'vitest'
import { pitchForZoom } from './camera.ts'

const stops = [[14, 0], [16, 40], [17, 55], [19, 72]] as const

test('点の倍率ではその傾き。範囲の外は端の値', () => {
  expect(pitchForZoom(16, stops)).toBe(40)
  expect(pitchForZoom(17, stops)).toBe(55)
  expect(pitchForZoom(13, stops)).toBe(0)
  expect(pitchForZoom(20, stops)).toBe(72)
})

test('あいだは寄るほど傾きが大きくなり、逆戻りしない', () => {
  let prev = -1
  for (let z = 13; z <= 19.5; z += 0.05) {
    const p = pitchForZoom(z, stops)
    expect(p).toBeGreaterThanOrEqual(prev)
    prev = p
  }
  expect(pitchForZoom(18, stops)).toBeGreaterThan(55)
  expect(pitchForZoom(18, stops)).toBeLessThan(72)
})

test('本物の設定（config の PITCH_BY_ZOOM）も、寄るほど傾きが大きく、上限を超えない', async () => {
  const { PITCH_BY_ZOOM, MAX_PITCH, PITCH, INITIAL_ZOOM } = await import('../config.ts')
  let prev = -1
  for (let z = 13; z <= 19.5; z += 0.05) {
    const p = pitchForZoom(z, PITCH_BY_ZOOM)
    expect(p).toBeGreaterThanOrEqual(prev)
    expect(p).toBeLessThanOrEqual(MAX_PITCH)
    prev = p
  }
  expect(pitchForZoom(INITIAL_ZOOM, PITCH_BY_ZOOM)).toBe(PITCH)
})
