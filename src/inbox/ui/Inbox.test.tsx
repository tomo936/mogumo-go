import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'
import { Inbox } from './Inbox.tsx'
import type { Notice, Present } from '../domain/inbox.ts'

const far = new Date(Date.now() + 3 * 86_400_000 + 60_000).toISOString()
const notices: Notice[] = [{ id: 1, title: 'ようこそ', body: '1行目\n2行目', at: '2026-11-17T00:00:00Z' }]
const presents: Present[] = [{ id: 9, title: 'おわび', message: 'ごめんね', coins: 100, expiresAt: far, claimed: false }]

const setup = (over: Partial<Parameters<typeof Inbox>[0]> = {}) => {
  const props = { notices, presents, read: new Set<number>(), onSeenNotices: vi.fn(), onClaim: vi.fn(async () => ({ coins: 100, status: 'ok' as const })), onClose: vi.fn(), ...over }
  render(<Inbox {...props} />)
  return props
}

test('受け取っていないプレゼントがあればプレゼントのタブで開き、期限が出る', () => {
  const p = setup()
  expect(screen.getByRole('tab', { name: /プレゼント/ })).toHaveAttribute('aria-selected', 'true')
  expect(screen.getByText('おわび')).toBeInTheDocument()
  expect(screen.getByText('受け取り期限: あと3日')).toBeInTheDocument()
  expect(p.onSeenNotices).not.toHaveBeenCalled()
})

test('受け取るを押すと番号で受け取りを頼む（2 度押しは 1 回）', async () => {
  const p = setup()
  const btn = screen.getByRole('button', { name: '受け取る' })
  await userEvent.click(btn)
  expect(p.onClaim).toHaveBeenCalledTimes(1)
  expect(p.onClaim).toHaveBeenCalledWith(9)
})

test('受け取り済みは押せない', () => {
  setup({ presents: [{ ...presents[0], claimed: true }] })
  expect(screen.queryByRole('button', { name: '受け取る' })).toBeNull()
})

test('受け取れなかったら知らせる', async () => {
  setup({ onClaim: vi.fn(async () => null) })
  await userEvent.click(screen.getByRole('button', { name: '受け取る' }))
  expect(await screen.findByText(/受け取れませんでした/)).toBeInTheDocument()
})

test('プレゼントが無ければお知らせのタブで開き、見たことを知らせる。未読は NEW', async () => {
  const p = setup({ presents: [] })
  expect(screen.getByRole('tab', { name: /お知らせ/ })).toHaveAttribute('aria-selected', 'true')
  expect(p.onSeenNotices).toHaveBeenCalled()
  expect(screen.getByText('NEW')).toBeInTheDocument()
})

test('読んだお知らせに NEW は出ない', () => {
  setup({ presents: [], read: new Set([1]) })
  expect(screen.queryByText('NEW')).toBeNull()
})
