import { expect, test } from 'vitest'
import { nextSetupPath } from './gate.ts'

test('プロフィールが無ければ最初から', () => {
  expect(nextSetupPath({ hasProfile: false, hasHome: false })).toBe('/setup/name')
  expect(nextSetupPath({ hasProfile: false, hasHome: true })).toBe('/setup/name')
})

test('プロフィールはあるが、この端末に自宅が無ければ自宅だけ', () => {
  expect(nextSetupPath({ hasProfile: true, hasHome: false })).toBe('/setup/home')
})

test('両方そろえば地図へ', () => {
  expect(nextSetupPath({ hasProfile: true, hasHome: true })).toBeNull()
})
