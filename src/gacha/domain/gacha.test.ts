import { expect, test } from 'vitest'
import { CHARACTERS, characterById } from './characters.ts'
import { bestRarity, friendshipHearts, parseDrawResult, parseGachaState, parseOwned, untilCeiling } from './gacha.ts'
import type { Draw } from './gacha.ts'

test('キャラは 30 体＋最初の 2 人。★5 4・★4 8・★3 18、入っているのは 01・05・06・14・26', () => {
  expect(CHARACTERS).toHaveLength(32)
  const count = (r: number) => CHARACTERS.filter((c) => c.rarity === r).length
  expect([count(5), count(4), count(3)]).toEqual([4, 8, 18])
  expect(CHARACTERS.filter((c) => c.inPool).map((c) => c.id)).toEqual([1, 5, 6, 14, 26])
  expect(characterById(26)?.name).toBe('みたらし団子うさぎ')
  expect(characterById(102)).toMatchObject({ name: '女の子', rarity: null })
  expect(characterById(99)).toBeUndefined()
})

test('なかよし度は 0〜5 で止める', () => {
  expect([0, 3, 5, 9, -1].map(friendshipHearts)).toEqual([0, 3, 5, 5, 0])
})

test('★5 確定まであと何回（前の ★5 の後に引いた回数から）', () => {
  expect([0, 29, 35].map(untilCeiling)).toEqual([30, 1, 1])
})

const row = { pos: 1, character_id: 14, rarity: 3, guarantee: 'none', is_new: true, friendship: 0, status: 'ok' }

test('引いた結果を読む', () => {
  expect(parseDrawResult([row])).toEqual({
    status: 'ok',
    draws: [{ pos: 1, characterId: 14, rarity: 3, guarantee: 'none', isNew: true, friendship: 0 }],
  })
  const ins = { pos: null, character_id: null, rarity: null, guarantee: null, is_new: null, friendship: null, status: 'insufficient' }
  expect(parseDrawResult([ins])).toEqual({ status: 'insufficient' })
  expect(parseDrawResult('x')).toBeNull()
  expect(parseDrawResult([])).toBeNull()
  expect(parseDrawResult([{ ...row, rarity: 7 }])).toBeNull()
})

test('状態と持ち物を読む', () => {
  expect(parseGachaState([{ pulls_since_five: 12, current_character_id: 5 }])).toEqual({ pullsSinceFive: 12, currentId: 5 })
  expect(parseGachaState([{ pulls_since_five: 0, current_character_id: null }])).toEqual({ pullsSinceFive: 0, currentId: null })
  expect(parseGachaState(null)).toBeNull()
  const owned = parseOwned([{ character_id: 5, duplicate_count: 2 }, { character_id: 'x' }, { character_id: 14, duplicate_count: 0 }])
  expect([...owned]).toEqual([[5, 2], [14, 0]])
  expect(parseOwned(null).size).toBe(0)
})

test('一番いい★（光の色）', () => {
  const d = (rarity: 3 | 4 | 5): Draw => ({ pos: 1, characterId: 1, rarity, guarantee: 'none', isNew: false, friendship: 0 })
  expect(bestRarity([d(3), d(4), d(3)])).toBe(4)
  expect(bestRarity([d(3)])).toBe(3)
})
