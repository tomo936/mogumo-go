import { expect, test } from 'vitest'
import { parseHome } from './home.ts'

test('正しい値を読む', () => {
  expect(parseHome('{"lat":35.7,"lng":139.5}')).toEqual({ lat: 35.7, lng: 139.5 })
})

test('無い・壊れている・範囲外は無いものとして扱う', () => {
  for (const t of [null, 'x', '{"lat":"a","lng":1}', '{"lat":91,"lng":0}', '{"lat":0,"lng":181}', '[]']) {
    expect(parseHome(t)).toBeNull()
  }
})
