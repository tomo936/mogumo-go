import { expect, test } from 'vitest'
import { HEIGHT_RATIO, liftM, liftTier, LIFT_TIERS } from './pinLift.ts'
import { MODEL_SCALE } from '../config.ts'
import type { ShopKind } from './shop.ts'

test('19種すべてに高さ/幅の比がある', () => {
  const kinds: ShopKind[] = ['ramen', 'sushi', 'soba', 'washoku', 'izakaya', 'bar', 'chinese', 'yakiniku', 'western', 'curry', 'cafe', 'cake', 'bakery', 'mystery', 'donburi', 'burger', 'ethnic', 'okonomiyaki', 'takoyaki']
  for (const k of kinds) expect(HEIGHT_RATIO[k]).toBeGreaterThan(0)
})

test('調査どおりの比（謎が一番低く、ラーメンが一番高い）', () => {
  expect(HEIGHT_RATIO.mystery).toBeCloseTo(0.6, 1)
  expect(HEIGHT_RATIO.ramen).toBeCloseTo(1.37, 2)
  expect(HEIGHT_RATIO.curry).toBeCloseTo(1.25, 2)
  expect(HEIGHT_RATIO.sushi).toBeCloseTo(1.14, 2)
})

test('liftM は 大きさ × 比 + 少し', () => {
  expect(liftM('ramen', 16, 0)).toBeCloseTo(16 * 1.37, 5)
  expect(liftM('ramen', 16)).toBeGreaterThan(liftM('ramen', 16, 0))
  expect(liftM('mystery', 14)).toBeLessThan(liftM('ramen', 18))
})

test('縮めて表示する種類（バー）は、模型が縮む分だけピンも低い（A17。バーは体積が大きく見えたので 88%）', () => {
  expect(MODEL_SCALE.bar).toBeCloseTo(0.88, 2)
  expect(liftM('bar', 16, 0)).toBeCloseTo(16 * 0.88 * HEIGHT_RATIO.bar, 5)
  expect(liftM('izakaya', 16, 0)).toBeCloseTo(16 * HEIGHT_RATIO.izakaya, 5) // ほかの種類は変えない
})

test('高さの段: 低い謎は low、背の高いラーメンは high', () => {
  expect(liftTier(liftM('mystery', 14))).toBe('low')
  expect(liftTier(liftM('ramen', 18))).toBe('high')
  expect(liftTier(liftM('cafe', 16))).toBe('mid')
})

test('段の境目は昇順で、段ごとの代表の高さは境目の間に入る', () => {
  expect(LIFT_TIERS.low.repM).toBeLessThan(LIFT_TIERS.mid.repM)
  expect(LIFT_TIERS.mid.repM).toBeLessThan(LIFT_TIERS.high.repM)
})
