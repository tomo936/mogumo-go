import { expect, test } from 'vitest'
import { checkinCues, missionCues, parsePrefs, townCues } from './sfx.ts'

test('チェックイン: ファンファーレ → 霧 → コイン → Lv アップ の順', () => {
  expect(checkinCues({ coins: 30, levelUp: 3 }).map((c) => c.name)).toEqual(['checkin', 'fog-clear', 'coin', 'levelup'])
  const t = checkinCues({ coins: 30, levelUp: 3 }).map((c) => c.atMs)
  expect(t).toEqual([...t].sort((a, b) => a - b))
  expect(t[0]).toBe(0)
})

test('チェックイン: コインが 0 ならコインの音なし、Lv が上がらなければ Lv の音なし', () => {
  expect(checkinCues({ coins: 0, levelUp: null }).map((c) => c.name)).toEqual(['checkin', 'fog-clear'])
})

test('町のクリア: 大ファンファーレ、コインがあればチャリン', () => {
  expect(townCues(50).map((c) => c.name)).toEqual(['town-clear', 'coin'])
  expect(townCues(0).map((c) => c.name)).toEqual(['town-clear'])
})

test('週ミッション: 達成 → コイン', () => {
  expect(missionCues().map((c) => c.name)).toEqual(['achieve', 'coin'])
})

test('設定: 無い・壊れていれば両方 ON、保存した値はそのまま', () => {
  expect(parsePrefs(null)).toEqual({ bgm: true, sfx: true })
  expect(parsePrefs('{bad')).toEqual({ bgm: true, sfx: true })
  expect(parsePrefs('{"bgm":false,"sfx":true}')).toEqual({ bgm: false, sfx: true })
  expect(parsePrefs('{"sfx":false}')).toEqual({ bgm: true, sfx: false })
})
