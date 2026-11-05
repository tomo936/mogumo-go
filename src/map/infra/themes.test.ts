import { expect, test } from 'vitest'
import { pickTheme } from './themes.ts'

test('URL の theme で色の案を選べる', () => {
  expect(pickTheme('?theme=mint', 'sky')).toBe('mint')
  expect(pickTheme('?fake&theme=pop', 'sky')).toBe('pop')
})

test('知らない名前や指定なしなら標準の案', () => {
  expect(pickTheme('?theme=evil', 'sky')).toBe('sky')
  expect(pickTheme('', 'sky')).toBe('sky')
})
