import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'
import { cellKey, cellsInCircle } from '../../fog/domain/grid.ts'
import type { Shop } from '../../shops/domain/shop.ts'
import { NearbyList } from './NearbyList.tsx'

const me = { lat: 35.65, lng: 139.63 }
const shop = (id: string, dLat: number, kind: Shop['kind']): Shop => ({ id, name: `店${id}`, lat: me.lat + dLat, lng: me.lng, kind, details: null, mapId: null })
const cleared = new Set(cellsInCircle(me, 2000).map(cellKey))
const shops = [shop('a', 0.001, 'ramen'), shop('b', 0.002, 'cafe'), shop('c', 0.003, 'ramen'), shop('far', 0.02, 'ramen')]
const show = (o: Partial<Parameters<typeof NearbyList>[0]> = {}) => {
  const p = { shops, me, cleared, checked: new Set<string>(), hiddenIds: new Set<string>(), onPick: vi.fn(), onClose: vi.fn(), ...o }
  render(<NearbyList {...p} />)
  return p
}

test('徒歩圏内のお店を近い順に出す（遠い店は出ない）', () => {
  show()
  const rows = screen.getAllByRole('button', { name: /^店/ })
  expect(rows.map((r) => r.textContent)).toEqual([expect.stringContaining('店a'), expect.stringContaining('店b'), expect.stringContaining('店c')])
  expect(screen.queryByText(/店far/)).not.toBeInTheDocument()
})

test('ジャンルの札で絞り込み、「すべて」で戻る', async () => {
  show()
  const chips = within(screen.getByRole('group', { name: 'ジャンルで絞り込む' }))
  await userEvent.click(chips.getByRole('button', { name: /ラーメン/ }))
  expect(screen.getAllByRole('button', { name: /^店/ })).toHaveLength(2)
  expect(screen.queryByText(/店b/)).not.toBeInTheDocument()
  await userEvent.click(chips.getByRole('button', { name: /すべて/ }))
  expect(screen.getAllByRole('button', { name: /^店/ })).toHaveLength(3)
})

test('お店を押すと onPick、済みのお店には印', async () => {
  const p = show({ checked: new Set(['b']) })
  expect(within(screen.getByRole('button', { name: /店b/ })).getByRole('img', { name: '済み' })).toBeInTheDocument()
  expect(within(screen.getByRole('button', { name: /店a/ })).queryByRole('img', { name: '済み' })).toBeNull()
  await userEvent.click(screen.getByRole('button', { name: /店a/ }))
  expect(p.onPick).toHaveBeenCalledWith(shops[0])
})

test('お店が無いときは歩いて晴らす案内。現在地が無いときは待ってもらう', () => {
  const { unmount } = (() => { const r = render(<NearbyList shops={[]} me={me} cleared={cleared} checked={new Set()} hiddenIds={new Set()} onPick={vi.fn()} onClose={vi.fn()} />); return r })()
  expect(screen.getByText(/まだありません/)).toBeInTheDocument()
  unmount()
  render(<NearbyList shops={shops} me={null} cleared={cleared} checked={new Set()} hiddenIds={new Set()} onPick={vi.fn()} onClose={vi.fn()} />)
  expect(screen.getByText(/現在地/)).toBeInTheDocument()
})

test('戻るで onClose', async () => {
  const p = show()
  await userEvent.click(screen.getByRole('button', { name: '戻る' }))
  expect(p.onClose).toHaveBeenCalled()
})
