import { afterEach, describe, expect, it, vi } from 'vitest'
import { loadRevealed, saveRevealed } from './revealStore.ts'

afterEach(() => {
  localStorage.clear()
  vi.restoreAllMocks()
})

describe('revealStore', () => {
  it('保存して同じ day・generation で読むと戻る', () => {
    saveRevealed('u', { day: '2026-11-07', generation: 1, ids: ['a', 'b'] })
    expect([...loadRevealed('u', '2026-11-07', 1)].sort()).toEqual(['a', 'b'])
  })
  it('day が違えば空、generation が違えば空、別のユーザーも空', () => {
    saveRevealed('u', { day: '2026-11-07', generation: 1, ids: ['a'] })
    expect(loadRevealed('u', '2026-11-08', 1).size).toBe(0)
    expect(loadRevealed('u', '2026-11-07', 2).size).toBe(0)
    expect(loadRevealed('v', '2026-11-07', 1).size).toBe(0)
  })
  it('壊れた JSON は空', () => {
    localStorage.setItem('mogumo.hintsRevealed.u', '{oops')
    expect(loadRevealed('u', '2026-11-07', 1).size).toBe(0)
    localStorage.setItem('mogumo.hintsRevealed.u', JSON.stringify({ day: '2026-11-07', generation: 1, ids: 'x' }))
    expect(loadRevealed('u', '2026-11-07', 1).size).toBe(0)
  })
  it('localStorage が例外を投げても落ちない', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('x') })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('x') })
    expect(loadRevealed('u', '2026-11-07', 1).size).toBe(0)
    expect(() => saveRevealed('u', { day: 'd', generation: 1, ids: [] })).not.toThrow()
  })
})
