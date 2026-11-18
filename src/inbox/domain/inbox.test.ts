import { expect, test } from 'vitest'
import { expiryText, firstTab, hasDot, parseClaimResult, parseNotices, parsePresents } from './inbox.ts'

const notice = { notice_id: 3, title: 'メンテのお知らせ', body: '明日の朝\n止まります', starts_at: '2026-11-17T01:00:00Z' }
const present = { present_id: 7, title: 'おわび', message: 'ごめんね', coins: 100, expires_at: '2026-11-20T00:00:00Z', claimed: false }

test('お知らせを読む。壊れた行は飛ばす', () => {
  expect(parseNotices([notice, { notice_id: 'x' }, null])).toEqual([{ id: 3, title: 'メンテのお知らせ', body: '明日の朝\n止まります', at: '2026-11-17T01:00:00Z' }])
  expect(parseNotices(null)).toEqual([])
})

test('プレゼントを読む。コインが 1〜10000 でない行は飛ばす', () => {
  expect(parsePresents([present, { ...present, present_id: 8, coins: 0 }])).toEqual([
    { id: 7, title: 'おわび', message: 'ごめんね', coins: 100, expiresAt: '2026-11-20T00:00:00Z', claimed: false },
  ])
  expect(parsePresents(undefined)).toEqual([])
})

test('受け取りの返事を読む', () => {
  expect(parseClaimResult([{ coins_awarded: 100, status: 'ok' }])).toEqual({ coins: 100, status: 'ok' })
  expect(parseClaimResult([{ coins_awarded: 0, status: 'already' }])).toEqual({ coins: 0, status: 'already' })
  expect(parseClaimResult([{ coins_awarded: 0, status: 'weird' }])).toBeNull()
  expect(parseClaimResult([])).toBeNull()
})

test('赤い点: 読んでいないお知らせか、受け取っていないプレゼントがあるとき', () => {
  const ns = parseNotices([notice])
  const ps = parsePresents([present])
  const claimed = parsePresents([{ ...present, claimed: true }])
  expect(hasDot(ns, new Set(), [])).toBe(true)
  expect(hasDot(ns, new Set([3]), [])).toBe(false)
  expect(hasDot([], new Set(), ps)).toBe(true)
  expect(hasDot([], new Set(), claimed)).toBe(false)
})

test('開いたときのタブ: 受け取っていないプレゼントがあればプレゼント', () => {
  expect(firstTab(parsePresents([present]))).toBe('presents')
  expect(firstTab(parsePresents([{ ...present, claimed: true }]))).toBe('notices')
  expect(firstTab([])).toBe('notices')
})

test('期限の文', () => {
  const now = new Date('2026-11-17T00:00:00Z')
  expect(expiryText('2026-11-20T00:00:00Z', now)).toBe('あと3日')
  expect(expiryText('2026-11-17T05:00:00Z', now)).toBe('あと5時間')
  expect(expiryText('2026-11-17T00:20:00Z', now)).toBe('まもなく終了')
  expect(expiryText('2026-11-16T00:00:00Z', now)).toBe('期限切れ')
})
