import { expect, test } from 'vitest'
import { APP_URL, shareClipboardText, zukanShareText } from './shareText.ts'

test('共有の文にはお店の名前・種類・アプリのリンクが入る', () => {
  const t = zukanShareText({ shopName: '麺屋 こはく', kindLabel: 'ラーメン', visits: 1 })
  expect(t.text).toContain('麺屋 こはく（ラーメン）にチェックインしたよ')
  expect(t.url).toBe(APP_URL)
  expect(t.url).toBe('https://mogumo-go.vercel.app')
})

test('2 回目からは回数が入る。種類が無ければ括弧を付けない', () => {
  expect(zukanShareText({ shopName: 'A', kindLabel: null, visits: 3 }).text).toContain('Aに3回目のチェックインしたよ')
})

test('コピーする文は、文のあとにリンク', () => {
  const t = zukanShareText({ shopName: 'A', kindLabel: null, visits: 1 })
  expect(shareClipboardText(t)).toBe(`${t.text}\n${APP_URL}`)
})
