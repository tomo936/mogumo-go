import { expect, test } from 'vitest'
import { openNow } from './openNow.ts'

// 日本時間の日時（'2026-11-10 12:00' は火曜）
const at = (s: string) => new Date(`${s.replace(' ', 'T')}:00+09:00`)

test('毎日の1つの時間帯: 中なら営業中と終わり、前なら何時から', () => {
  expect(openNow('11:00～22:00', at('2026-11-10 12:00'))).toEqual({ state: 'open', until: '22:00' })
  expect(openNow('11:00～22:00', at('2026-11-10 09:30'))).toEqual({ state: 'closed', from: '11:00' })
  expect(openNow('11:00～22:00', at('2026-11-10 22:30'))).toEqual({ state: 'closed', from: null })
})

test('曜日ごと・昼と夜・ラストオーダーのかっこは読まない', () => {
  const t = '月～金: 11:30～14:00 （料理L.O. 13:30）17:00～23:00 土、日、祝日: 11:30～22:00'
  expect(openNow(t, at('2026-11-10 15:00'))).toEqual({ state: 'closed', from: '17:00' }) // 火
  expect(openNow(t, at('2026-11-10 18:00'))).toEqual({ state: 'open', until: '23:00' })
  expect(openNow(t, at('2026-11-14 15:00'))).toEqual({ state: 'open', until: '22:00' }) // 土
})

test('日またぎ（翌3:00・27:00）は前の日の続きで営業中', () => {
  expect(openNow('18:00～翌3:00', at('2026-11-10 01:00'))).toEqual({ state: 'open', until: '3:00' })
  expect(openNow('月～日: 18:00～27:00', at('2026-11-10 23:00'))).toEqual({ state: 'open', until: '3:00' })
})

test('曜日の書いていない日は休み', () => {
  expect(openNow('月～金: 11:00～20:00', at('2026-11-15 12:00'))).toEqual({ state: 'closed', from: null }) // 日
})

test('区切りの無い時刻（15:0018:00）と全角の記号も読める', () => {
  expect(openNow('11：00〜15:0017:00〜21:00', at('2026-11-10 16:00'))).toEqual({ state: 'closed', from: '17:00' })
})

test('読めない文は unknown', () => {
  expect(openNow('不定休', at('2026-11-10 12:00'))).toEqual({ state: 'unknown' })
  expect(openNow('', at('2026-11-10 12:00'))).toEqual({ state: 'unknown' })
})
