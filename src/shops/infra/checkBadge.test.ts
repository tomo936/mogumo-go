import { expect, test } from 'vitest'
import { checkBadgeImage } from './checkBadge.ts'

test('canvas が使えない環境では null（jsdom）', () => {
  expect(checkBadgeImage({ width: 128, height: 128 } as never)).toBeNull()
})

test('大きさが 0 の絵は null', () => {
  expect(checkBadgeImage({ width: 0, height: 0 } as never)).toBeNull()
})
