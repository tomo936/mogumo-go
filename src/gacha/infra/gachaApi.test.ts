import { expect, test, vi } from 'vitest'
import { charArtUrl, drawGacha, loadGachaState, loadOwned, setCharacter } from './gachaApi.ts'

const fake = (data: unknown, error: unknown = null) => ({ rpc: vi.fn(async () => ({ data, error })) })

test('引く: 種類を渡し、返事を読む。失敗は null', async () => {
  const c = fake([{ pos: 1, character_id: 5, rarity: 4, guarantee: 'none', is_new: true, friendship: 0, status: 'ok' }])
  expect(await drawGacha('ten', c)).toMatchObject({ status: 'ok', draws: [{ characterId: 5 }] })
  expect(c.rpc).toHaveBeenCalledWith('draw_gacha', { p_type: 'ten' })
  expect(await drawGacha('single', fake(null, { message: 'x' }))).toBeNull()
  expect(await drawGacha('single', { rpc: () => Promise.reject(new Error('net')) })).toBeNull()
})

test('使うキャラを変える: ok のときだけ true', async () => {
  const c = fake('ok')
  expect(await setCharacter(5, c)).toBe(true)
  expect(c.rpc).toHaveBeenCalledWith('set_character', { p_character_id: 5 })
  expect(await setCharacter(7, fake('not_owned'))).toBe(false)
  expect(await setCharacter(7, fake(null, {}))).toBe(false)
})

test('状態と持ち物', async () => {
  expect(await loadGachaState(fake([{ pulls_since_five: 3, current_character_id: null }]))).toEqual({ pullsSinceFive: 3, currentId: null })
  expect(await loadGachaState(fake(null, {}))).toBeNull()
  expect([...(await loadOwned(fake([{ character_id: 14, duplicate_count: 1 }])))]).toEqual([[14, 1]])
})

test('絵: ガチャのキャラと最初の 2 人', () => {
  expect(charArtUrl(26)).toMatch(/26\.webp/)
  expect(charArtUrl(102)).toMatch(/starter-girl/)
  expect(charArtUrl(101)).toMatch(/starter-boy/)
})
