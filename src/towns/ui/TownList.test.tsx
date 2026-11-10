import { render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import { TownList } from './TownList.tsx'
import type { TownProgress } from '../domain/progress.ts'

const town = (o: Partial<TownProgress> = {}): TownProgress => ({
  id: '13112-経堂', name: '経堂', city: '世田谷区', visited: 3, total: 12, clearedAt: null, completedAt: null, counting: false, lastAt: 1, ...o,
})
const ready = (towns: TownProgress[], more = false) => ({ status: 'ready' as const, towns, more })

test('町の名前・市区町村・数・割合を出す', () => {
  render(<TownList state={ready([town()])} />)
  expect(screen.getByText('経堂')).toBeInTheDocument()
  expect(screen.getByText('世田谷区')).toBeInTheDocument()
  expect(screen.getByText('3 / 12')).toBeInTheDocument()
  expect(screen.getByText('25%')).toBeInTheDocument()
  expect(screen.getByRole('progressbar', { name: '経堂の進み具合' })).toHaveAttribute('aria-valuenow', '25')
  expect(screen.queryByText('クリア')).not.toBeInTheDocument()
})

test('クリア済みは「クリア」、コンプリートは「コンプリート」の印', () => {
  render(<TownList state={ready([
    town({ id: 'a', name: '宮坂', visited: 6, total: 12, clearedAt: 5 }),
    town({ id: 'b', name: '桜丘', visited: 4, total: 4, clearedAt: 5, completedAt: 9 }),
  ])} />)
  expect(screen.getAllByText('クリア')).toHaveLength(1)
  expect(screen.getAllByText('コンプリート')).toHaveLength(1)
  expect(screen.getByText('100%')).toBeInTheDocument()
})

test('数えている途中の町は「数えています…」で、数は出さない', () => {
  render(<TownList state={ready([town({ counting: true, visited: 1, total: 0 })], true)} />)
  expect(screen.getByText('数えています…')).toBeInTheDocument()
  expect(screen.queryByText('1 / 0')).not.toBeInTheDocument()
  expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
})

test('町が無ければ案内。まだ続きがあるあいだは数えている文', () => {
  const { rerender } = render(<TownList state={ready([])} />)
  expect(screen.getByText('お店に行くと、町の進み具合がここに出ます')).toBeInTheDocument()
  rerender(<TownList state={ready([], true)} />)
  expect(screen.getByText('町のお店を数えています…')).toBeInTheDocument()
})

test('読み込み中と、読めなかったときの文', () => {
  const { rerender } = render(<TownList state={{ status: 'loading' }} />)
  expect(screen.getByText('町の進み具合を読み込んでいます…')).toBeInTheDocument()
  rerender(<TownList state={{ status: 'error' }} />)
  expect(screen.getByRole('alert')).toHaveTextContent('町の進み具合を読み込めませんでした')
})
