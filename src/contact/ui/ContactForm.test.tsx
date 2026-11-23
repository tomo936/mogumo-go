import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'
import { ContactForm } from './ContactForm.tsx'

test('本文が空のあいだは送れない。種類と本文を送り、届いたら知らせる', async () => {
  const send = vi.fn(async () => 'ok' as const)
  render(<ContactForm email="mogu@example.com" send={send} onClose={vi.fn()} />)
  const btn = screen.getByRole('button', { name: '送る' })
  expect(btn).toBeDisabled()
  expect(screen.getByText(/mogu@example.com/)).toBeInTheDocument()
  await userEvent.click(screen.getByLabelText('使い方の質問'))
  await userEvent.type(screen.getByLabelText('内容'), 'コインの使い道は？')
  await userEvent.click(btn)
  expect(send).toHaveBeenCalledWith('question', 'コインの使い道は？')
  expect(await screen.findByRole('status')).toHaveTextContent('届きました')
})

test('送りすぎ・失敗はそのまま書き直せるように知らせる', async () => {
  const send = vi.fn(async () => 'too_many' as const)
  render(<ContactForm email={null} send={send} onClose={vi.fn()} />)
  await userEvent.type(screen.getByLabelText('内容'), 'x')
  await userEvent.click(screen.getByRole('button', { name: '送る' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('1 日 5 件')
  expect(screen.getByLabelText('内容')).toHaveValue('x')
})

test('ゲストが送ったあとは「メールアドレスにお送りします」と言わない（2026-11-24）', async () => {
  const send = vi.fn(async () => 'ok' as const)
  render(<ContactForm email={null} guest send={send} onClose={vi.fn()} />)
  await userEvent.type(screen.getByLabelText('内容'), 'たのしい')
  await userEvent.click(screen.getByRole('button', { name: '送る' }))
  const done = await screen.findByRole('status')
  expect(done).toHaveTextContent('届きました')
  expect(done).not.toHaveTextContent('メールアドレスにお送りします')
  expect(done).toHaveTextContent('ゲストには返事を送れません')
})
