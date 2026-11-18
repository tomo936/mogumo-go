import { expect, test } from 'vitest'
import { daysLeftUntil, missionCondition, missionTitle, parseWeek } from './mission.ts'

const raw = {
  week_start: '2026-11-09', week_end: '2026-11-15', newly: ['b'],
  missions: [
    { mission_id: 'a', difficulty: 'easy', condition_type: 'genre', params: { key: 'genre_week', kinds: ['ramen'] }, target: 1, progress: 0, reward: 50, completed: false },
    { mission_id: 'b', difficulty: 'normal', condition_type: 'distinct_kinds', params: { key: 'sanshoku' }, target: 3, progress: 3, reward: 100, completed: true },
    { mission_id: 'c', difficulty: 'hard', condition_type: 'weekend', params: { key: 'weekend' }, target: 3, progress: 1, reward: 150, completed: false },
  ],
}

test('返事を読む（知らない種類は捨てる・形が違えば null）', () => {
  const w = parseWeek(raw)!
  expect(w.weekEnd).toBe('2026-11-15')
  expect(w.missions.map((m) => m.difficulty)).toEqual(['easy', 'normal', 'hard'])
  expect(w.missions[0].kinds).toEqual(['ramen'])
  expect(w.newly).toEqual(['b'])
  expect(parseWeek({ ...raw, missions: [{ ...raw.missions[0], difficulty: 'x' }] })).toBeNull()
  expect(parseWeek({ missions: 'x' })).toBeNull()
})

test('名前と条件の文', () => {
  const [a, b, c] = parseWeek(raw)!.missions
  expect(missionTitle(a)).toBe('今週のラーメン')
  expect(missionCondition(a)).toBe('ラーメンのお店に1軒')
  expect(missionTitle(b)).toBe('三色だんご')
  expect(missionCondition(b)).toBe('ちがうジャンルのお店を3種類')
  expect(missionCondition(c)).toBe('土日に3軒')
})

test('のこり日数（今日を含めて日曜まで）', () => {
  expect(daysLeftUntil('2026-11-15', new Date('2026-11-09T01:00:00+09:00'))).toBe(7)
  expect(daysLeftUntil('2026-11-15', new Date('2026-11-15T23:00:00+09:00'))).toBe(1)
})
