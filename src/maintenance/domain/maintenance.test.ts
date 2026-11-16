import { describe, expect, it } from 'vitest'
import { endsLabel, parseStatus } from './maintenance.ts'

describe('メンテナンスの決まり', () => {
  it('返事を読む（配列の 1 行目）。形がおかしければ null（止めない）', () => {
    expect(parseStatus([{ maintenance: true, message: '町を追加中', ends_at: '2026-11-20T09:00:00Z' }])).toEqual({
      on: true,
      message: '町を追加中',
      endsAt: '2026-11-20T09:00:00Z',
    })
    expect(parseStatus([{ maintenance: false, message: '', ends_at: null }])).toEqual({ on: false, message: '', endsAt: null })
    expect(parseStatus([])).toBeNull()
    expect(parseStatus(null)).toBeNull()
    expect(parseStatus([{ maintenance: 'yes' }])).toBeNull()
  })

  it('終わる予定は日本時間で。今日なら時刻だけ、別の日なら日付も', () => {
    const now = new Date('2026-11-20T01:00:00Z') // 日本時間 11/20 10:00
    expect(endsLabel('2026-11-20T09:00:00Z', now)).toBe('18:00ごろ終わる予定')
    expect(endsLabel('2026-11-21T00:30:00Z', now)).toBe('11月21日 9:30ごろ終わる予定')
    expect(endsLabel(null, now)).toBeNull()
    expect(endsLabel('おかしい', now)).toBeNull()
    expect(endsLabel('2026-11-20T00:00:00Z', now)).toBeNull() // もう過ぎた予定は出さない
  })
})
