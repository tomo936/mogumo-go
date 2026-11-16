import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { GUIDE_PAGES } from '../domain/guide.ts'

vi.mock('../infra/poko.ts', () => ({ mountPoko: () => Promise.reject(new Error('jsdom')) }))
const { Guide } = await import('./Guide.tsx')

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

test('タップ 1 回目は文を全部出し、2 回目で次のページ、スキップで閉じる', () => {
  const onClose = vi.fn()
  render(<Guide meOnScreen={() => null} onClose={onClose} />)
  const box = screen.getByRole('dialog', { name: 'ポコタンの案内' })
  fireEvent.click(box)
  expect(screen.getByText(GUIDE_PAGES[0].text)).toBeInTheDocument()
  fireEvent.click(box)
  act(() => void vi.advanceTimersByTime(10_000))
  expect(screen.getByText(GUIDE_PAGES[1].text)).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'スキップ' }))
  expect(onClose).toHaveBeenCalledTimes(1)
})

test('最後のページを読み終えてタップすると閉じる', () => {
  const onClose = vi.fn()
  render(<Guide meOnScreen={() => null} onClose={onClose} />)
  const box = screen.getByRole('dialog', { name: 'ポコタンの案内' })
  for (let i = 0; i < GUIDE_PAGES.length; i++) {
    fireEvent.click(box) // 全部出す
    fireEvent.click(box) // 次へ（最後は閉じる）
  }
  expect(onClose).toHaveBeenCalledTimes(1)
})
