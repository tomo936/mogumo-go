import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'
import type { ZukanShop } from '../domain/zukan.ts'

const load = vi.fn<() => Promise<ZukanShop[]>>()
vi.mock('../infra/zukanApi.ts', () => ({ loadZukan: () => load() }))
const stars = vi.fn<() => Promise<Map<string, number>>>(async () => new Map())
vi.mock('../../reviews/infra/reviewsApi.ts', () => ({ loadMyLatestStars: () => stars() }))

import { Zukan } from './Zukan.tsx'
import { PAGE_SIZE, cardNo } from '../domain/zukan.ts'

const base = { kind: 'ramen', photoUrl: null, genreName: 'ラーメン', budgetName: null, lat: 35, lng: 139, mapId: null, cleared: true } as const
const visited: ZukanShop = { ...base, id: 'hp:A', name: '麺屋A', catch: 'こだわり', visits: { count: 2, firstDay: '2026-11-03', lastDay: '2026-11-08' } }
const unknown: ZukanShop = { ...base, id: 'hp:B', name: '秘密のラーメン屋', catch: '濃厚とんこつ', visits: null }

test('読み込み中の文を出し、読めたら埋まり数を出す', async () => {
  load.mockResolvedValueOnce([visited, unknown])
  render(<Zukan onLocate={() => {}} onClose={() => {}} />)
  expect(screen.getByText('図鑑を開いています…')).toBeInTheDocument()
  expect(await screen.findByLabelText('1/2 訪問済み')).toBeInTheDocument()
})

test('行っていないお店は名前を出さず「？」と一言だけ', async () => {
  load.mockResolvedValueOnce([visited, unknown])
  render(<Zukan onLocate={() => {}} onClose={() => {}} />)
  await screen.findByLabelText('1/2 訪問済み')
  expect(screen.queryByText('秘密のラーメン屋')).not.toBeInTheDocument()
  expect(screen.getByText('？？？')).toBeInTheDocument()
  expect(screen.getByText('濃厚とんこつ')).toBeInTheDocument()
})

test('行ったお店を押すと詳細が開き、地図で見るで onLocate に渡る', async () => {
  load.mockResolvedValueOnce([visited])
  const onLocate = vi.fn()
  render(<Zukan onLocate={onLocate} onClose={() => {}} />)
  await userEvent.click(await screen.findByRole('button', { name: '麺屋A 2回行った' }))
  expect(screen.getByText('図鑑カード詳細')).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: '地図で見る' }))
  expect(onLocate).toHaveBeenCalledWith(visited)
})

test('読めなければ文言を出す', async () => {
  load.mockRejectedValueOnce(new Error('x'))
  render(<Zukan onLocate={() => {}} onClose={() => {}} />)
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('図鑑を読み込めませんでした'))
})

test('ジャンルが無いときは案内を出す', async () => {
  load.mockResolvedValueOnce([])
  render(<Zukan onLocate={() => {}} onClose={() => {}} />)
  expect(await screen.findByText(/まだ見つけたお店がありません/)).toBeInTheDocument()
})

test('行ったカード: No.・名前・回数・自分の感想の星。無ければ「感想まだ」', async () => {
  const b: ZukanShop = { ...visited, id: 'hp:C', name: '麺屋C', visits: { count: 6, firstDay: '2026-10-01', lastDay: '2026-11-01' } }
  load.mockResolvedValueOnce([visited, b])
  stars.mockResolvedValueOnce(new Map([['hp:A', 4]]))
  render(<Zukan onLocate={() => {}} onClose={() => {}} />)
  const a = await screen.findByRole('button', { name: '麺屋A 2回行った' })
  expect(a).toHaveTextContent('No.001')
  expect(a).toHaveTextContent('★★★★☆')
  const c = screen.getByRole('button', { name: '麺屋C 6回行った' })
  expect(c).toHaveTextContent('No.002')
  expect(c).toHaveTextContent('感想まだ')
  expect(c).toHaveTextContent('6回')
  expect(c).toHaveClass('zukan__card--silver')
})

test('10 回以上は金の枠。星が読めなくても図鑑は出る', async () => {
  load.mockResolvedValueOnce([{ ...visited, visits: { count: 10, firstDay: '2026-10-01', lastDay: '2026-11-01' } }])
  stars.mockRejectedValueOnce(new Error('x'))
  render(<Zukan onLocate={() => {}} onClose={() => {}} />)
  const a = await screen.findByRole('button', { name: '麺屋A 10回行った' })
  expect(a).toHaveClass('zukan__card--gold')
  expect(a).toHaveTextContent('感想まだ')
})

test('行っていないカードは押せない', async () => {
  load.mockResolvedValueOnce([unknown])
  render(<Zukan onLocate={() => {}} onClose={() => {}} />)
  await screen.findByText('？？？')
  expect(screen.queryByRole('button', { name: /秘密/ })).not.toBeInTheDocument()
  expect(screen.getByLabelText('まだ行っていないお店').tagName).not.toBe('BUTTON')
})

test('1 ページは 9 枚', async () => {
  load.mockResolvedValueOnce(Array.from({ length: 12 }, (_, i) => ({ ...unknown, id: `hp:U${String(i).padStart(2, '0')}` })))
  render(<Zukan onLocate={() => {}} onClose={() => {}} />)
  await screen.findAllByText('？？？')
  expect(PAGE_SIZE).toBe(9)
  expect(screen.getAllByText('？？？')).toHaveLength(9)
  expect(screen.getByText('1 / 2')).toBeInTheDocument()
})

test('cardNo は 3 桁', () => {
  expect(cardNo(0)).toBe('No.001')
  expect(cardNo(41)).toBe('No.042')
})
