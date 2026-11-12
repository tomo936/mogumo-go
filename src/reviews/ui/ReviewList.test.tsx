import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'
import { ReviewList } from './ReviewList.tsx'
import type { Review } from '../domain/review.ts'

const rv = (id: string, extra: Partial<Review> = {}): Review => ({
  id, checkinId: `c${id}`, shopId: 'hp:A', userId: `u${id}`, stars: 4, body: `本文${id}`, photoPath: null, isPublic: true, createdAt: '2026-11-03T03:00:00Z', nickname: `名前${id}`, ...extra,
})
const photos = vi.fn(async (paths: string[]) => new Map(paths.map((p) => [p, `https://s/${p}`])))

test('0 件なら「まだ感想がありません」', async () => {
  render(<ReviewList shopId="hp:A" load={async () => ({ items: [], hasMore: false })} summary={async () => null} photos={photos} />)
  expect(await screen.findByText('まだ感想がありません')).toBeInTheDocument()
})

test('件数と平均、「もっと見る」で次のページ', async () => {
  const load = vi.fn(async (_s: string, page: number) => (page === 0 ? { items: [rv('1', { photoPath: 'u1/a.jpg' })], hasMore: true } : { items: [rv('2')], hasMore: false }))
  render(<ReviewList shopId="hp:A" load={load} summary={async () => ({ avg: 4.3, count: 12 })} photos={photos} />)
  expect(await screen.findByText('本文1')).toBeInTheDocument()
  expect(screen.getByText('12件')).toBeInTheDocument()
  expect(screen.getByText('★ 4.3')).toBeInTheDocument()
  expect(screen.getByText('名前1')).toBeInTheDocument()
  await userEvent.click(await screen.findByRole('button', { name: '写真を大きく見る' }))
  expect(screen.getByRole('dialog', { name: '写真' })).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: '写真を閉じる' }))
  await userEvent.click(screen.getByRole('button', { name: 'もっと見る' }))
  expect(await screen.findByText('本文2')).toBeInTheDocument()
  expect(load).toHaveBeenLastCalledWith('hp:A', 1)
  expect(screen.queryByRole('button', { name: 'もっと見る' })).not.toBeInTheDocument()
})

test('「⋯」→ 確認 → 通報。済みでも「通報しました」', async () => {
  const report = vi.fn(async () => 'already' as const)
  render(<ReviewList shopId="hp:A" load={async () => ({ items: [rv('1')], hasMore: false })} summary={async () => null} report={report} photos={photos} />)
  await userEvent.click(await screen.findByRole('button', { name: '名前1 さんの感想のメニュー' }))
  expect(report).not.toHaveBeenCalled()
  await userEvent.click(screen.getByRole('button', { name: '通報する' }))
  expect(report).toHaveBeenCalledWith('1')
  await waitFor(() => expect(screen.getByText('通報しました')).toBeInTheDocument())
})
