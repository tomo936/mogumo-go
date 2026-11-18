import { expect, test } from 'vitest'
import { STAMP_COINS, cardOf, parseClaim, parseState } from './loginBonus.ts'

test('スタンプの枚数: 1〜6 個目は 10、7 個目は 50', () => {
  expect(STAMP_COINS).toEqual([10, 10, 10, 10, 10, 10, 50])
})

test('カードの様子: まだ 1 度も受け取っていない → 0 個、次は 1 個目', () => {
  expect(cardOf({ total: 0, claimedToday: false })).toEqual({ filled: 0, next: 0 })
})

test('カードの様子: 今日受け取った → 受け取った分まで押してある、次の日の分は無い', () => {
  expect(cardOf({ total: 1, claimedToday: true })).toEqual({ filled: 1, next: null })
  expect(cardOf({ total: 4, claimedToday: true })).toEqual({ filled: 4, next: null })
})

test('カードの様子: 今日はまだ → 前の日までの分が押してあり、次は押す所', () => {
  expect(cardOf({ total: 3, claimedToday: false })).toEqual({ filled: 3, next: 3 })
})

test('7 個そろった日は全部押してある。次の日からは新しいカード（0 個）', () => {
  expect(cardOf({ total: 7, claimedToday: true })).toEqual({ filled: 7, next: null })
  expect(cardOf({ total: 7, claimedToday: false })).toEqual({ filled: 0, next: 0 })
  expect(cardOf({ total: 8, claimedToday: true })).toEqual({ filled: 1, next: null })
  expect(cardOf({ total: 14, claimedToday: true })).toEqual({ filled: 7, next: null })
})

test('サーバーの返事の読み取り: 受け取った／受け取り済み／壊れた返事', () => {
  expect(parseClaim([{ stamp_no: 2, coins_awarded: 10, claimed_now: true }])).toEqual({ stampNo: 2, coins: 10, claimedNow: true })
  expect(parseClaim([{ stamp_no: 2, coins_awarded: 0, claimed_now: false }])).toEqual({ stampNo: 2, coins: 0, claimedNow: false })
  expect(parseClaim([])).toBeNull()
  expect(parseClaim(null)).toBeNull()
  expect(parseClaim([{ stamp_no: 9, coins_awarded: 10, claimed_now: true }])).toBeNull()
  expect(parseClaim([{ stamp_no: 'x' }])).toBeNull()
})

test('状態の読み取り', () => {
  expect(parseState([{ total: 3, claimed_today: true }])).toEqual({ total: 3, claimedToday: true })
  expect(parseState([{ total: -1, claimed_today: true }])).toBeNull()
  expect(parseState(undefined)).toBeNull()
})
