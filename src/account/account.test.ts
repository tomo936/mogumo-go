import { expect, test, vi } from 'vitest'
import { keysOfUser } from './domain/localKeys.ts'
import { deleteAccount } from './infra/deleteAccount.ts'

test('この人の端末のデータ（キーに user_id を含む mogumo.*）だけを選ぶ', () => {
  const keys = ['mogumo.home.u1', 'mogumo.tutorial.u1', 'mogumo.home.u2', 'mogumo.sound', 'other.u1']
  expect(keysOfUser(keys, 'u1')).toEqual(['mogumo.home.u1', 'mogumo.tutorial.u1'])
})

test('関数が消せたら、端末のこの人のデータも消して true', async () => {
  localStorage.setItem('mogumo.home.u1', '{}')
  localStorage.setItem('mogumo.home.u2', '{}')
  const post = vi.fn(async () => true)
  expect(await deleteAccount('u1', post)).toBe(true)
  expect(localStorage.getItem('mogumo.home.u1')).toBeNull()
  expect(localStorage.getItem('mogumo.home.u2')).toBe('{}')
})

test('関数が失敗したら端末のデータは残して false', async () => {
  localStorage.setItem('mogumo.home.u3', '{}')
  expect(await deleteAccount('u3', async () => false)).toBe(false)
  expect(localStorage.getItem('mogumo.home.u3')).toBe('{}')
})
