import { expect, test } from 'vitest'
import { checkNickname, remainingChars } from './nickname.ts'

test('前後の空白を除いて受け付ける', () => {
  expect(checkNickname('  もぐ  ')).toEqual({ ok: true, value: 'もぐ' })
})

test('空や空白だけは入れてもらう', () => {
  expect(checkNickname('')).toEqual({ ok: false, reason: 'empty' })
  expect(checkNickname('   ')).toEqual({ ok: false, reason: 'empty' })
})

test('10文字までは受け付け、11文字は長すぎ', () => {
  expect(checkNickname('あ'.repeat(10)).ok).toBe(true)
  expect(checkNickname('あ'.repeat(11))).toEqual({ ok: false, reason: 'tooLong' })
})

test('絵文字は1つを1文字に数える（コードポイント数）', () => {
  expect(checkNickname('😀'.repeat(10)).ok).toBe(true)
})

test('残りの文字数', () => {
  expect(remainingChars('もぐもぐ')).toBe(6)
  expect(remainingChars('あ'.repeat(12))).toBe(-2)
})
