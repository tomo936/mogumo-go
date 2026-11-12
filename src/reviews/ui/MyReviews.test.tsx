import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'
import { MyReviews } from './MyReviews.tsx'
import type { Review } from '../domain/review.ts'

const rv = (id: string, checkinId: string, extra: Partial<Review> = {}): Review => ({
  id, checkinId, shopId: 'hp:A', userId: 'me', stars: 4, body: `感想${id}`, photoPath: null, isPublic: true, createdAt: '2026-11-03T03:00:00Z', nickname: null, ...extra,
})
const visits = [{ checkinId: 'c2', checkedInAt: '2026-11-03T03:00:00Z' }, { checkinId: 'c1', checkedInAt: '2026-10-12T03:00:00Z' }]
const photos = vi.fn(async (paths: string[]) => new Map(paths.map((p) => [p, `https://s/${p}`])))

test('感想が無ければ「まだ感想がありません」と「感想を書く」→ エディターが新しい訪問で開く', async () => {
  render(<MyReviews shopId="hp:A" shopName="麺屋A" load={async () => ({ visits, mine: [] })} photos={photos} />)
  expect(await screen.findByText('まだ感想がありません')).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: '感想を書く' }))
  expect(screen.getByRole('dialog', { name: '感想を書く' })).toHaveTextContent('2026.11.03 の訪問')
})

test('新しい訪問の感想が先頭。非公開は「自分だけ」の札、前の感想の件数、写真', async () => {
  const mine = [rv('a', 'c1'), rv('b', 'c2', { isPublic: false, photoPath: 'me/p.jpg', stars: 5 })]
  render(<MyReviews shopId="hp:A" shopName="麺屋A" load={async () => ({ visits, mine })} photos={photos} />)
  const first = await screen.findByText('感想b')
  expect(first).toBeInTheDocument()
  expect(screen.getByText('🔒 自分だけ')).toBeInTheDocument()
  expect(screen.getByText('前の感想（1件）')).toBeInTheDocument()
  expect(await screen.findByRole('img', { name: '自分の写真' })).toHaveAttribute('src', 'https://s/me/p.jpg')
  await userEvent.click(screen.getByRole('button', { name: '書く・直す' }))
  expect(screen.getByLabelText('ひとこと')).toHaveValue('感想b')
})

test('読めなければ文を出す', async () => {
  render(<MyReviews shopId="hp:A" shopName="麺屋A" load={async () => { throw new Error('x') }} photos={photos} />)
  expect(await screen.findByText('感想を読み込めませんでした')).toBeInTheDocument()
})
