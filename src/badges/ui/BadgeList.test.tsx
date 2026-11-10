import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test } from 'vitest'
import { evaluate } from '../domain/evaluate.ts'
import type { BadgeVisit } from '../domain/types.ts'
import { BadgeList } from './BadgeList.tsx'

const v = (kind: BadgeVisit['kind'], iso: string): BadgeVisit => ({ shopId: iso, kind, at: Date.parse(iso), lat: 35, lng: 139, wasHint: false, mysteryHint: false })
const states = evaluate({ visits: [v('ramen', '2026-11-01T03:00:00Z'), v('ramen', '2026-11-02T03:00:00Z'), v('ramen', '2026-11-03T03:00:00Z')], cellTimes: [], home: null })

test('グループの見出しと「取れた数 / 全部」', () => {
  render(<BadgeList states={states} hasHome={false} />)
  const genre = screen.getByRole('region', { name: 'ジャンル' })
  expect(within(genre).getByText('2 / 90')).toBeInTheDocument() // 数はバッジの数
  expect(screen.getByRole('region', { name: 'ちょっと変わった' })).toBeInTheDocument()
})

test('段のある実績は1つにまとめ、今の段を見せる。押すと取った日・次の段・5段の並び', async () => {
  render(<BadgeList states={states} hasHome={false} />)
  const genre = screen.getByRole('region', { name: 'ジャンル' })
  expect(within(genre).getAllByRole('button')).toHaveLength(18)
  expect(within(genre).queryByRole('img', { name: 'ラーメン通（まだ）' })).not.toBeInTheDocument()
  await userEvent.click(within(genre).getByRole('img', { name: 'ラーメン好き' }))
  expect(screen.getByText('2026.11.03 にとった')).toBeInTheDocument()
  expect(screen.getByText('つぎは「ラーメン通」 あと 7回')).toBeInTheDocument()
  expect(within(screen.getByLabelText('段')).getAllByRole('img')).toHaveLength(5)
})

test('まだ1段も取れていないジャンルは最初の段と「あと N」', async () => {
  render(<BadgeList states={states} hasHome={false} />)
  await userEvent.click(screen.getByRole('img', { name: 'はじめての寿司（まだ）' }))
  expect(screen.getByText('寿司のお店に 1回行く')).toBeInTheDocument()
  expect(screen.getByText('あと 1回')).toBeInTheDocument()
})

test('ひみつは取るまで ？？？ で、条件も出ない', async () => {
  render(<BadgeList states={states} hasHome={false} />)
  const group = screen.getByRole('region', { name: '季節・記念日' })
  await userEvent.click(within(group).getAllByRole('img', { name: '？？？（まだ）' })[0])
  expect(screen.getByText('ひみつの実績。条件は取るまでのお楽しみ')).toBeInTheDocument()
  expect(screen.queryByText(/大みそか/)).not.toBeInTheDocument()
})

test('自宅が無いと遠征に案内文', async () => {
  render(<BadgeList states={states} hasHome={false} />)
  await userEvent.click(screen.getByRole('img', { name: 'ご近所たんけん（まだ）' }))
  expect(screen.getByText('自宅を設定すると数えます')).toBeInTheDocument()
})
