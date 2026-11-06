import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'
import type { Shop } from '../../shops/domain/shop.ts'
import { BuildingSheet } from './BuildingSheet.tsx'

const shop = (id: string, name: string): Shop => ({ id, name, lat: 35, lng: 139, kind: 'cafe', details: null, mapId: null })
const shops = [shop('a', 'らーめん太郎'), shop('b', 'カフェ花'), shop('c', 'いざかや一番')]

test('見出しは「このビルのお店」と「済み 1/3」', () => {
  render(<BuildingSheet shops={shops} checkedIds={new Set(['b'])} onPick={vi.fn()} onClose={vi.fn()} />)
  expect(screen.getByText('このビルのお店')).toBeInTheDocument()
  expect(screen.getByText('済み 1/3')).toBeInTheDocument()
})

test('名前の順（日本語の並び）に並ぶ', () => {
  render(<BuildingSheet shops={shops} checkedIds={new Set()} onPick={vi.fn()} onClose={vi.fn()} />)
  const names = screen.getAllByRole('listitem').map((li) => li.textContent?.replace('✓', ''))
  expect(names).toEqual([...shops.map((s) => s.name)].sort((x, y) => x.localeCompare(y, 'ja')))
})

test('済みの店の行に ✓', () => {
  render(<BuildingSheet shops={shops} checkedIds={new Set(['b'])} onPick={vi.fn()} onClose={vi.fn()} />)
  const row = screen.getByRole('button', { name: /カフェ花/ })
  expect(within(row).getByText('✓')).toBeInTheDocument()
  expect(within(screen.getByRole('button', { name: /らーめん太郎/ })).queryByText('✓')).toBeNull()
})

test('行を押すと onPick(その店)、閉じるで onClose', async () => {
  const onPick = vi.fn()
  const onClose = vi.fn()
  render(<BuildingSheet shops={shops} checkedIds={new Set()} onPick={onPick} onClose={onClose} />)
  await userEvent.click(screen.getByRole('button', { name: /いざかや一番/ }))
  expect(onPick).toHaveBeenCalledWith(shops[2])
  await userEvent.click(screen.getByRole('button', { name: '閉じる' }))
  expect(onClose).toHaveBeenCalled()
})
