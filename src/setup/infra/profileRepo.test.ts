import type { SupabaseClient } from '@supabase/supabase-js'
import { expect, test, vi } from 'vitest'
import { createProfileRepo } from './profileRepo.ts'

vi.mock('../../lib/supabase.ts', () => ({ supabase: {} }))

function fakeClient(result: { data?: unknown; error: unknown }) {
  const insert = vi.fn(async () => result)
  const maybeSingle = vi.fn(async () => result)
  const eq = vi.fn(() => ({ maybeSingle }))
  const select = vi.fn(() => ({ eq }))
  const from = vi.fn(() => ({ insert, select }))
  return { client: { from } as unknown as SupabaseClient, from, insert, eq }
}

test('作るときに送るのはニックネームとキャラの番号だけ（自宅は送らない）', async () => {
  const f = fakeClient({ error: null })
  await createProfileRepo(f.client).create({ nickname: 'もぐ', starterId: 101 })
  expect(f.from).toHaveBeenCalledWith('profiles')
  expect(f.insert).toHaveBeenCalledWith({ nickname: 'もぐ', starter_character_id: 101 })
})

test('作るのに失敗したら知らせる', async () => {
  const f = fakeClient({ error: { message: 'x' } })
  await expect(createProfileRepo(f.client).create({ nickname: 'もぐ', starterId: 102 })).rejects.toThrow()
})

test('行があれば true、無ければ false', async () => {
  const yes = fakeClient({ data: { user_id: 'u' }, error: null })
  expect(await createProfileRepo(yes.client).exists('u')).toBe(true)
  expect(yes.eq).toHaveBeenCalledWith('user_id', 'u')
  const no = fakeClient({ data: null, error: null })
  expect(await createProfileRepo(no.client).exists('u')).toBe(false)
})

test('読むのに失敗したら知らせる', async () => {
  const f = fakeClient({ data: null, error: { message: 'x' } })
  await expect(createProfileRepo(f.client).exists('u')).rejects.toThrow()
})

test('ニックネームの変更は profiles の nickname だけを、本人の行で更新する', async () => {
  const eq = vi.fn(async () => ({ error: null }))
  const update = vi.fn(() => ({ eq }))
  const from = vi.fn(() => ({ update }))
  await createProfileRepo({ from } as unknown as SupabaseClient).updateNickname('u1', 'もぐもぐ')
  expect(from).toHaveBeenCalledWith('profiles')
  expect(update).toHaveBeenCalledWith({ nickname: 'もぐもぐ' })
  expect(eq).toHaveBeenCalledWith('user_id', 'u1')
})

test('ニックネームの変更に失敗したら知らせる', async () => {
  const from = vi.fn(() => ({ update: () => ({ eq: async () => ({ error: { message: 'x' } }) }) }))
  await expect(createProfileRepo({ from } as unknown as SupabaseClient).updateNickname('u1', 'もぐ')).rejects.toThrow()
})
