import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'
import type { ClearedCell, VisitEntry } from '../domain/timeline.ts'

import type { ClearedTown } from '../../towns/domain/shape.ts'
import type { TownProgress, TownSync } from '../../towns/domain/progress.ts'

const load = vi.fn<() => Promise<{ cells: ClearedCell[]; visits: VisitEntry[]; towns: ClearedTown[] }>>()
vi.mock('../infra/recordApi.ts', () => ({ loadRecord: () => load() }))
// 町の進み具合（サーバーの関数）。何も返さない = 読めなかった
type Sync = (onUpdate: (s: TownSync) => void, opts?: { alive?: () => boolean }) => Promise<void>
const sync = vi.fn<Sync>(async () => {})
vi.mock('../../towns/infra/townsApi.ts', () => ({ syncUntilSettled: (...a: Parameters<Sync>) => sync(...a) }))

vi.mock('../../world/ui/WorldMap.tsx', () => ({ WorldMap: ({ onClose }: { onClose: () => void }) => <button onClick={onClose}>world-close</button> }))
vi.mock('./RecordMap.tsx', () => ({ RecordMap: () => <div data-testid="record-map" /> }))

import { Record } from './Record.tsx'

const day = (s: string) => Date.parse(`${s}T12:00:00+09:00`)
const cells: ClearedCell[] = Array.from({ length: 1600 }, (_, i) => ({ x: i % 40, y: Math.floor(i / 40), at: day(i < 800 ? '2026-10-01' : '2026-11-03') }))
const visits: VisitEntry[] = [
  { shopId: 'hp:A', name: '麺屋A', kind: 'ramen', photoUrl: null, day: '2026-10-05', at: Date.parse('2026-10-05T03:00:00Z'), lat: 35, lng: 139, wasHint: false, mysteryHint: false },
  { shopId: 'hp:B', name: 'カフェB', kind: 'cafe', photoUrl: null, day: '2026-11-03', at: Date.parse('2026-11-03T03:00:00Z'), lat: 35, lng: 139, wasHint: false, mysteryHint: false },
]

test('読み込み中の文を出し、読めたら数字と履歴を出す（いちばん新しい日で）', async () => {
  load.mockResolvedValueOnce({ cells, visits, towns: [] })
  render(<Record home={null} onClose={() => {}} />)
  expect(screen.getByText('記録を開いています…')).toBeInTheDocument()
  // 1600 マス = 1km²
  expect(await screen.findByText('1.00')).toBeInTheDocument()
  expect(screen.getByText('麺屋A')).toBeInTheDocument()
  expect(screen.getAllByText('カフェB')).toHaveLength(2) // この日に行ったお店 と 履歴
  expect(screen.getByText('2026年11月')).toBeInTheDocument()
})

test('スライダーを前の日に動かすと、そのあとに晴れた場所・行ったお店が減る', async () => {
  load.mockResolvedValueOnce({ cells, visits, towns: [] })
  render(<Record home={null} onClose={() => {}} />)
  const slider = (await screen.findByLabelText('日付')) as HTMLInputElement
  fireEvent.change(slider, { target: { value: String(day('2026-10-10')) } })
  expect(screen.getByText('0.50')).toBeInTheDocument() // 800 マス
  expect(screen.getByText('麺屋A')).toBeInTheDocument()
  expect(screen.queryByText('カフェB')).not.toBeInTheDocument()
})

test('‹ は前の行った日へ跳び、見出しに曜日と軒数、その日のお店の一覧', async () => {
  load.mockResolvedValueOnce({ cells, visits, towns: [] })
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
  load.mockResolvedValueOnce({ cells: [], visits: [], towns: [] })
  render(<Record home={null} onClose={() => {}} />)
  expect(await screen.findByText(/まだ晴れた場所がありません/)).toBeInTheDocument()
  expect(screen.queryByLabelText('日付')).not.toBeInTheDocument()
})

test('読めなければ文言を出す', async () => {
  load.mockRejectedValueOnce(new Error('x'))
  render(<Record home={null} onClose={() => {}} />)
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('記録を読み込めませんでした'))
})

// 晴れたマス（0,0 のあたり）と重ならない町。2km²、11/3 にクリア
const farTown: ClearedTown = {
  id: '13112-経堂', name: '経堂', city: '世田谷区', areaM2: 2_000_000, at: day('2026-11-03'),
  geom: { type: 'Polygon', coordinates: [[[1, 1], [1.01, 1], [1.01, 1.01], [1, 1.01], [1, 1]]] }, bbox: [1, 1, 1.01, 1.01],
}
const progress = (o: Partial<TownProgress> = {}): TownProgress => ({
  id: '13112-経堂', name: '経堂', city: '世田谷区', visited: 3, total: 12, clearedAt: null, completedAt: null, counting: false, lastAt: 1, ...o,
})

test('町のクリア・コンプリートの見出しと、町の進み具合の一覧。戻るボタンで閉じる', async () => {
  load.mockResolvedValueOnce({ cells, visits, towns: [] })
  sync.mockImplementationOnce(async (onUpdate) => onUpdate({ towns: [progress()], newly: [], more: false }))
  const onClose = vi.fn()
  const onTownSync = vi.fn()
  render(<Record home={null} onClose={onClose} onTownSync={onTownSync} />)
  expect(await screen.findByText('町のクリア・コンプリート')).toBeInTheDocument()
  expect(screen.queryByText(/準備中です/)).not.toBeInTheDocument()
  expect(await screen.findByText('経堂')).toBeInTheDocument()
  expect(screen.getByText('3 / 12')).toBeInTheDocument()
  expect(onTownSync).not.toHaveBeenCalled() // 新しく取れたものが無ければ知らせない
  await userEvent.click(screen.getByRole('button', { name: '戻る' }))
  expect(onClose).toHaveBeenCalled()
})

test('町の進み具合が読めなければ、その文だけ出す（記録は出る）', async () => {
  load.mockResolvedValueOnce({ cells, visits, towns: [] })
  render(<Record home={null} onClose={() => {}} />)
  expect(await screen.findByText('町の進み具合を読み込めませんでした')).toBeInTheDocument()
  expect(screen.getByText('1.00')).toBeInTheDocument()
})

test('晴れた広さにクリアした町の広さが入る。クリアより前の日には入らない', async () => {
  load.mockResolvedValueOnce({ cells, visits, towns: [farTown] })
  render(<Record home={null} onClose={() => {}} />)
  expect(await screen.findByText('3.00')).toBeInTheDocument() // マス 1km² ＋ 町 2km²
  fireEvent.change(screen.getByLabelText('日付'), { target: { value: String(day('2026-10-10')) } })
  expect(screen.getByText('0.50')).toBeInTheDocument()
})

test('開いているあいだに町をクリアしたら、広さに足して、地図の画面へ知らせる', async () => {
  load.mockResolvedValueOnce({ cells, visits, towns: [] })
  const s: TownSync = {
    towns: [progress({ visited: 6, clearedAt: day('2026-11-04') })],
    newly: [{ id: farTown.id, name: '経堂', kind: 'clear', coins: 100, town: { ...farTown, at: day('2026-11-04') } }],
    more: false,
  }
  sync.mockImplementationOnce(async (onUpdate) => onUpdate(s))
  const onTownSync = vi.fn()
  render(<Record home={null} onClose={() => {}} onTownSync={onTownSync} />)
  expect(await screen.findByText('3.00')).toBeInTheDocument()
  expect(onTownSync).toHaveBeenCalledWith(s)
  expect(screen.getByText('クリア')).toBeInTheDocument()
})

test('じっせきのタブに切りかえるとバッジが出る', async () => {
  load.mockResolvedValueOnce({ cells, visits, towns: [] })
  render(<Record home={null} onClose={() => {}} />)
  await userEvent.click(await screen.findByRole('tab', { name: 'じっせき' }))
  expect(screen.getByRole('img', { name: 'はじめてのラーメン' })).toBeInTheDocument()
  expect(screen.getByText(/とった実績 \d+ \/ \d+/)).toBeInTheDocument()
})

test('はじめから じっせき のタブで開ける', async () => {
  load.mockResolvedValueOnce({ cells, visits, towns: [] })
  render(<Record home={null} onClose={() => {}} initialTab="badges" />)
  expect(await screen.findByRole('img', { name: 'はじめてのカフェ' })).toBeInTheDocument()
})

test('「ワールドマップ」を押すと日本地図が重なり、戻ると閉じる', async () => {
  load.mockResolvedValueOnce({ cells, visits, towns: [] })
  render(<Record home={null} onClose={() => {}} />)
  await userEvent.click(await screen.findByRole('button', { name: 'ワールドマップ' }))
  await userEvent.click(screen.getByText('world-close'))
  expect(screen.queryByText('world-close')).toBeNull()
})
