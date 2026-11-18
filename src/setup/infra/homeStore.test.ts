import { expect, test } from 'vitest'
import { loadHome, saveHome } from './homeStore.ts'
import { memoryStorage } from './memoryStorage.ts'

const home = { lat: 35.7, lng: 139.5 }

test('同じアカウントで保存した自宅を読める', () => {
  const s = memoryStorage()
  saveHome('user-a', home, s)
  expect(loadHome('user-a', s)).toEqual(home)
})

test('別のアカウントからは前の人の自宅が読めない', () => {
  const s = memoryStorage()
  saveHome('user-a', home, s)
  expect(loadHome('user-b', s)).toBeNull()
})

test('壊れた値や読めないときは無いものとして扱う', () => {
  const s = memoryStorage()
  s.setItem('mogumo.home.user-a', 'broken')
  expect(loadHome('user-a', s)).toBeNull()
  const throwing = { ...memoryStorage(), getItem: () => { throw new Error('blocked') } } as Storage
  expect(loadHome('user-a', throwing)).toBeNull()
})
