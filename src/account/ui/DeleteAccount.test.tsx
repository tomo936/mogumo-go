import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'
import { DeleteAccount } from './DeleteAccount.tsx'

test('2 回確かめてから消し、消えたら onDeleted', async () => {
  const remove = vi.fn(async () => true)
  const onDeleted = vi.fn()
  render(<DeleteAccount remove={remove} onDeleted={onDeleted} onClose={vi.fn()} />)
  await userEvent.click(screen.getByRole('button', { name: '消してやめる' }))
  expect(remove).not.toHaveBeenCalled()
  await userEvent.click(screen.getByRole('button', { name: 'すべて消す' }))
  expect(remove).toHaveBeenCalledTimes(1)
  expect(onDeleted).toHaveBeenCalled()
})

test('やっぱりやめるで戻れる。失敗したら知らせて onDeleted は呼ばない', async () => {
  const onDeleted = vi.fn()
  render(<DeleteAccount remove={async () => false} onDeleted={onDeleted} onClose={vi.fn()} />)
  await userEvent.click(screen.getByRole('button', { name: '消してやめる' }))
  await userEvent.click(screen.getByRole('button', { name: 'やっぱりやめる' }))
  expect(screen.queryByRole('button', { name: 'すべて消す' })).toBeNull()
  await userEvent.click(screen.getByRole('button', { name: '消してやめる' }))
  await userEvent.click(screen.getByRole('button', { name: 'すべて消す' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('消せませんでした')
  expect(onDeleted).not.toHaveBeenCalled()
})
