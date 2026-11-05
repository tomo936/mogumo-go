import { expect, test } from 'vitest'
import { clearDraft, loadDraft, saveDraft } from './draftStore.ts'
import { memoryStorage } from './memoryStorage.ts'

test('下書きは書き足すと両方残り、消すと空になる', () => {
  const s = memoryStorage()
  saveDraft({ nickname: 'もぐ' }, s)
  saveDraft({ starterId: 101 }, s)
  expect(loadDraft(s)).toEqual({ nickname: 'もぐ', starterId: 101 })
  clearDraft(s)
  expect(loadDraft(s)).toEqual({})
})

test('壊れた下書きは空として扱う', () => {
  const s = memoryStorage()
  s.setItem('mogumo.setupDraft', '{bad')
  expect(loadDraft(s)).toEqual({})
})
