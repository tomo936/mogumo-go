import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'
import type { ZukanShop } from '../domain/zukan.ts'

const load = vi.fn<(c?: unknown, o?: unknown) => Promise<ZukanShop[]>>()
vi.mock('../infra/zukanApi.ts', () => ({ loadZukan: (c?: unknown, o?: unknown) => load(c, o) }))
vi.mock('../../reviews/infra/reviewsApi.ts', () => ({
  loadMine: async () => ({ visits: [], mine: [] }),
  loadOthers: async () => ({ items: [], hasMore: false }),
  loadSummary: async () => null,
  photoUrls: async () => new Map(),
  reportReview: async () => 'ok',
  saveReview: async () => { throw new Error('x') },
  deleteReview: async () => {},
}))

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
  const d = screen.getByRole('region', { name: '図鑑カード詳細' })
  expect(d).toHaveTextContent('No.001')
  expect(screen.getByLabelText('訪問済み 2026.11.08')).toBeInTheDocument()
  expect(d).toHaveTextContent('2回行った')
  expect(d).toHaveTextContent('はじめて')
  expect(d).toHaveTextContent('この前')
  expect(screen.getByRole('heading', { name: /わたしの感想/ })).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: /みんなの感想/ })).toBeInTheDocument()
  expect(d).not.toHaveTextContent('準備中')
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

test('行ったカード: No.・名前・回数・お店の特徴（ホットペッパーのひと言。無ければ空）', async () => {
  const b: ZukanShop = { ...visited, id: 'hp:C', name: '麺屋C', catch: null, visits: { count: 6, firstDay: '2026-10-01', lastDay: '2026-11-01' } }
  load.mockResolvedValueOnce([visited, b])
  render(<Zukan onLocate={() => {}} onClose={() => {}} />)
  const a = await screen.findByRole('button', { name: '麺屋A 2回行った' })
  expect(a).toHaveTextContent('No.001')
  expect(a).toHaveTextContent('こだわり')
  expect(a).not.toHaveTextContent('感想まだ')
  const c = screen.getByRole('button', { name: '麺屋C 6回行った' })
  expect(c).toHaveTextContent('No.002')
  expect(c).not.toHaveTextContent('はじめて')
  expect(c).not.toHaveTextContent('ラーメン')
  expect(c).toHaveTextContent('6回')
  expect(c).toHaveClass('zukan__card--silver')
})

test('10 回以上は金の枠', async () => {
  load.mockResolvedValueOnce([{ ...visited, visits: { count: 10, firstDay: '2026-10-01', lastDay: '2026-11-01' } }])
  render(<Zukan onLocate={() => {}} onClose={() => {}} />)
  expect(await screen.findByRole('button', { name: '麺屋A 10回行った' })).toHaveClass('zukan__card--gold')
})

test('カードの下の段は、行ったカードも「？」のカードも同じ 1 行（ひと言が無くても行を置く）', async () => {
  load.mockResolvedValueOnce([visited, { ...unknown, catch: null }])
  const { container } = render(<Zukan onLocate={() => {}} onClose={() => {}} />)
  await screen.findByText('？？？')
  expect(container.querySelectorAll('.zukan__card .zukan__foot')).toHaveLength(2)
})

test('行っていないカードを押すと、場所のヒント（方角と距離）が出る。詳細は開かない', async () => {
  load.mockResolvedValueOnce([{ ...unknown, lat: 35.65 + 350 / 111_320, lng: 139.63 }])
  render(<Zukan onLocate={() => {}} onClose={() => {}} origin={{ pos: { lat: 35.65, lng: 139.63 }, from: 'here' }} />)
  await userEvent.click(await screen.findByRole('button', { name: 'まだ行っていないお店のヒント' }))
  expect(screen.getByRole('status')).toHaveTextContent('ここから 北へ 350m')
  expect(screen.queryByRole('region', { name: '図鑑カード詳細' })).not.toBeInTheDocument()
  expect(screen.queryByText('秘密のラーメン屋')).not.toBeInTheDocument()
})

test('どこから測るか分からなければ、行っていないカードは押せない', async () => {
  load.mockResolvedValueOnce([unknown])
  render(<Zukan onLocate={() => {}} onClose={() => {}} />)
  await screen.findByText('？？？')
  expect(screen.queryByRole('button', { name: 'まだ行っていないお店のヒント' })).not.toBeInTheDocument()
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

test('地図のお店と晴れたマスを読み込みに渡す', async () => {
  load.mockResolvedValueOnce([])
  const mapShops = [{ id: 'osm:5', name: 'たこ焼き', lat: 35, lng: 139, kind: 'takoyaki' as const, details: null, mapId: null }]
  const cleared = new Set(['1:2'])
  render(<Zukan onLocate={() => {}} onClose={() => {}} mapShops={mapShops} cleared={cleared} />)
  await screen.findByText(/まだ見つけたお店がありません/)
  expect(load).toHaveBeenLastCalledWith(undefined, { mapShops, cleared })
})
