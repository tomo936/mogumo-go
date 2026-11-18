import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'
import { PullScreen } from './PullScreen.tsx'
import type { Draw } from '../domain/gacha.ts'

const d = (pos: number, characterId: number, rarity: 3 | 4 | 5, isNew = true, friendship = 0): Draw => ({
  pos, characterId, rarity, guarantee: 'none', isNew, friendship,
})

test('1 体: 押すと演出を飛ばして名前と NEW!、とじるで終わる', async () => {
  const onDone = vi.fn()
  render(<PullScreen draws={[d(1, 14, 3)]} onDone={onDone} />)
  await userEvent.click(screen.getByRole('dialog'))
  expect(await screen.findByText('クッキーくま')).toBeInTheDocument()
  expect(screen.getByText('NEW!')).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'とじる' }))
  expect(onDone).toHaveBeenCalled()
})

test('ダブりは なかよし度 の文', async () => {
  render(<PullScreen draws={[d(1, 5, 4, false, 2)]} onDone={() => {}} />)
  await userEvent.click(screen.getByRole('dialog'))
  expect(await screen.findByText(/なかよし度 ♥\+1/)).toBeInTheDocument()
  expect(screen.queryByText('NEW!')).toBeNull()
})

test('10 体: スキップで 10 体が並ぶ', async () => {
  const draws = [1, 5, 6, 14, 26, 14, 14, 26, 6, 5].map((id, i) => d(i + 1, id, id === 1 ? 5 : id <= 6 ? 4 : 3))
  render(<PullScreen draws={draws} onDone={() => {}} />)
  await userEvent.click(screen.getByRole('button', { name: 'スキップ' }))
  expect(screen.getAllByRole('listitem')).toHaveLength(10)
  expect(screen.getByRole('button', { name: 'とじる' })).toBeInTheDocument()
})

test('10 体: 押すたびに次の 1 体', async () => {
  const draws = [14, 26, 14, 14, 26, 14, 14, 26, 6, 5].map((id, i) => d(i + 1, id, id <= 6 ? 4 : 3))
  render(<PullScreen draws={draws} onDone={() => {}} />)
  const dlg = screen.getByRole('dialog')
  await userEvent.click(dlg) // 演出を飛ばす → 1 体目
  expect(await screen.findByText('1 / 10')).toBeInTheDocument()
  await userEvent.click(dlg)
  expect(screen.getByText('2 / 10')).toBeInTheDocument()
})
