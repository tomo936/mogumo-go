import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'
import type { ClearedCell, VisitEntry } from '../domain/timeline.ts'

const load = vi.fn<() => Promise<{ cells: ClearedCell[]; visits: VisitEntry[] }>>()
vi.mock('../infra/recordApi.ts', () => ({ loadRecord: () => load() }))

vi.mock('./RecordMap.tsx', () => ({ RecordMap: () => <div data-testid="record-map" /> }))

import { Record } from './Record.tsx'

const day = (s: string) => Date.parse(`${s}T12:00:00+09:00`)
const cells: ClearedCell[] = Array.from({ length: 1600 }, (_, i) => ({ x: i % 40, y: Math.floor(i / 40), at: day(i < 800 ? '2026-10-01' : '2026-11-03') }))
const visits: VisitEntry[] = [
  { shopId: 'hp:A', name: '麺屋A', kind: 'ramen', photoUrl: null, day: '2026-10-05' },
  { shopId: 'hp:B', name: 'カフェB', kind: 'cafe', photoUrl: null, day: '2026-11-03' },
]

test('読み込み中の文を出し、読めたら数字と履歴を出す（いちばん新しい日で）', async () => {
  load.mockResolvedValueOnce({ cells, visits })
  render(<Record home={null} onClose={() => {}} />)
  expect(screen.getByText('記録を開いています…')).toBeInTheDocument()
  // 1600 マス = 1km²
  expect(await screen.findByText('1.00')).toBeInTheDocument()
  expect(screen.getByText('麺屋A')).toBeInTheDocument()
  expect(screen.getByText('カフェB')).toBeInTheDocument()
  expect(screen.getByText('2026年11月')).toBeInTheDocument()
})

test('スライダーを前の日に動かすと、そのあとに晴れた場所・行ったお店が減る', async () => {
  load.mockResolvedValueOnce({ cells, visits })
  render(<Record home={null} onClose={() => {}} />)
  const slider = (await screen.findByLabelText('日付')) as HTMLInputElement
  fireEvent.change(slider, { target: { value: String(day('2026-10-10')) } })
  expect(screen.getByText('0.50')).toBeInTheDocument() // 800 マス
  expect(screen.getByText('麺屋A')).toBeInTheDocument()
  expect(screen.queryByText('カフェB')).not.toBeInTheDocument()
})

test('1週前ボタンで日付が戻る', async () => {
  load.mockResolvedValueOnce({ cells, visits })
  render(<Record home={null} onClose={() => {}} />)
  await userEvent.click(await screen.findByRole('button', { name: '1週間前' }))
  expect(screen.getByText('0.50')).toBeInTheDocument() // 11/3 から 1 週戻ると 10/27 → 10/01 分だけ
})

test('晴れた場所が無ければ案内を出し、スライダーは出さない', async () => {
  load.mockResolvedValueOnce({ cells: [], visits: [] })
  render(<Record home={null} onClose={() => {}} />)
  expect(await screen.findByText(/まだ晴れた場所がありません/)).toBeInTheDocument()
  expect(screen.queryByLabelText('日付')).not.toBeInTheDocument()
})

test('読めなければ文言を出す', async () => {
  load.mockRejectedValueOnce(new Error('x'))
  render(<Record home={null} onClose={() => {}} />)
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('記録を読み込めませんでした'))
})

test('町のクリア・コンプリートは準備中の枠、戻るボタンで閉じる', async () => {
  load.mockResolvedValueOnce({ cells, visits })
  const onClose = vi.fn()
  render(<Record home={null} onClose={onClose} />)
  expect(await screen.findByText('町のクリア・コンプリート')).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: '戻る' }))
  expect(onClose).toHaveBeenCalled()
})
