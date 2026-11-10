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
  { shopId: 'hp:A', name: '麺屋A', kind: 'ramen', photoUrl: null, day: '2026-10-05', at: Date.parse('2026-10-05T03:00:00Z'), lat: 35, lng: 139, wasHint: false, mysteryHint: false },
  { shopId: 'hp:B', name: 'カフェB', kind: 'cafe', photoUrl: null, day: '2026-11-03', at: Date.parse('2026-11-03T03:00:00Z'), lat: 35, lng: 139, wasHint: false, mysteryHint: false },
]

test('読み込み中の文を出し、読めたら数字と履歴を出す（いちばん新しい日で）', async () => {
  load.mockResolvedValueOnce({ cells, visits })
  render(<Record home={null} onClose={() => {}} />)
  expect(screen.getByText('記録を開いています…')).toBeInTheDocument()
  // 1600 マス = 1km²
  expect(await screen.findByText('1.00')).toBeInTheDocument()
  expect(screen.getByText('麺屋A')).toBeInTheDocument()
  expect(screen.getAllByText('カフェB')).toHaveLength(2) // この日に行ったお店 と 履歴
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

test('‹ は前の行った日へ跳び、見出しに曜日と軒数、その日のお店の一覧', async () => {
  load.mockResolvedValueOnce({ cells, visits })
  render(<Record home={null} onClose={() => {}} />)
  expect(await screen.findByText(/^11\/3（火）\s+1軒$/)).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: '前の行った日' }))
  expect(screen.getByText(/^10\/5（月）\s+1軒$/)).toBeInTheDocument()
  expect(screen.getByText('0.50')).toBeInTheDocument() // 10/01 に晴れた分だけ
  expect(screen.getByText('この日に行ったお店')).toBeInTheDocument()
  expect(screen.getByText('12:00')).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: '前の行った日' }))
  expect(screen.getByText(/^10\/5（月）\s+1軒$/)).toBeInTheDocument() // それより前は無いので止まる
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
