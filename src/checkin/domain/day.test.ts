import { expect, test } from 'vitest'
import { jstDay } from './day.ts'

test('日本時間の0時で日が変わる', () => {
  expect(jstDay(new Date('2026-11-06T14:59:59Z'))).toBe('2026-11-06')
  expect(jstDay(new Date('2026-11-06T15:00:00Z'))).toBe('2026-11-07')
})
