import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'
import type { ZukanShop } from '../domain/zukan.ts'

const load = vi.fn<() => Promise<ZukanShop[]>>()
vi.mock('../infra/zukanApi.ts', () => ({ loadZukan: () => load() }))

import { Zukan } from './Zukan.tsx'

const base = { kind: 'ramen', photoUrl: null, genreName: 'ラーメン', budgetName: null, lat: 35, lng: 139, mapId: null, cleared: true } as const
const visited: ZukanShop = { ...base, id: 'hp:A', name: '麺屋A', catch: 'こだわり', visits: { count: 2, firstDay: '2026-11-03', lastDay: '2026-11-08' } }
const unknown: ZukanShop = { ...base, id: 'hp:B', name: '秘密のラーメン屋', catch: '濃厚とんこつ', visits: null }

test('読み込み中の文を出し、読めたら埋まり数を出す', async () => {
  load.mockResolvedValueOnce([visited, unknown])
  render(<Zukan onLocate={() => {}} onClose={() => {}} />)
  expect(screen.getByText('図鑑を開いています…')).toBeInTheDocument()
  expect(await screen.findByText('1/2')).toBeInTheDocument()
})

test('行っていないお店は名前を出さず「？」と一言だけ', async () => {
  load.mockResolvedValueOnce([visited, unknown])
  render(<Zukan onLocate={() => {}} onClose={() => {}} />)
  await screen.findByText('1/2')
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
