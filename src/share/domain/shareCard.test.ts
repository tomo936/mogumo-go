import { expect, test } from 'vitest'
import { starLine, visitText, wrapLines } from './shareCard.ts'

const m = (s: string) => s.length * 10 // 1 字 10px

test('星は 5 つで、塗りと白抜き', () => {
  expect(starLine(3)).toBe('★★★☆☆')
  expect(starLine(0)).toBe('☆☆☆☆☆')
  expect(starLine(9)).toBe('★★★★★')
})

test('幅で折り、行が多いときは最後を「…」で終える', () => {
  expect(wrapLines('あいうえおかきくけこ', 50, 3, m)).toEqual(['あいうえお', 'かきくけこ'])
  expect(wrapLines('あいうえおかきくけこさしすせそたち', 50, 2, m)).toEqual(['あいうえお', 'かきくけ…'])
})

test('来店の回数の言い方', () => {
  expect(visitText(1)).toBe('はじめての来店')
  expect(visitText(4)).toBe('4回目の来店')
})
