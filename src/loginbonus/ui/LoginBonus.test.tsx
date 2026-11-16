import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'
import { LoginBonus } from './LoginBonus.tsx'

test('3 個目: 1〜2 個目は押してある、3 個目が今日の分、残りは次の分の枚数が薄く出る', () => {
  render(<LoginBonus claim={{ stampNo: 3, coins: 10, claimedNow: true }} onClose={vi.fn()} />)
  const slots = screen.getAllByTestId('stamp')
  expect(slots).toHaveLength(7)
  expect(slots.map((s) => s.dataset.state)).toEqual(['done', 'done', 'today', 'todo', 'todo', 'todo', 'todo'])
  expect(screen.getByRole('status')).toHaveTextContent('3日目')
  expect(screen.getByRole('status')).toHaveTextContent('+10')
  expect(within(slots[6]).getByText('+50')).toBeInTheDocument() // 7 個目は多め
})

test('7 個目: 全部押してあり、いちばん多いコイン', () => {
  render(<LoginBonus claim={{ stampNo: 7, coins: 50, claimedNow: true }} onClose={vi.fn()} />)
  expect(screen.getAllByTestId('stamp').map((s) => s.dataset.state)).toEqual(['done', 'done', 'done', 'done', 'done', 'done', 'today'])
  expect(screen.getByRole('status')).toHaveTextContent('+50')
  expect(screen.getByRole('status')).toHaveTextContent('1 周')
})

test('とじる（ボタンでも背景でも）', async () => {
  const onClose = vi.fn()
  render(<LoginBonus claim={{ stampNo: 1, coins: 10, claimedNow: true }} onClose={onClose} />)
  await userEvent.click(screen.getByRole('button', { name: 'とじる' }))
  expect(onClose).toHaveBeenCalledTimes(1)
})
