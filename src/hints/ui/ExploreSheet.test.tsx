import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'
import type { Shop } from '../../shops/domain/shop.ts'
import { ExploreSheet } from './ExploreSheet.tsx'
import { hint, setOf } from './fixtures.ts'

type Props = Parameters<typeof ExploreSheet>[0]
const base = (): Props => ({
  status: 'ready', set: null, revealed: new Set<string>(), distances: new Map<string, number>(), regenVisible: false, fast: false,
  notice: null, guide: [], onPickHint: vi.fn(), onPickShop: vi.fn(), onRegen: vi.fn(), onRetry: vi.fn(), onClose: vi.fn(),
})
const show = (o: Partial<Props> = {}) => {
  const p = { ...base(), ...o }
  render(<ExploreSheet {...p} />)
  return p
}

test.each([
  ['loading', '気配を探しています…'],
  ['fast', '降りたら今日の気配が出るよ'],
  ['unavailable', 'いまは気配を探せません'],
  ['timeout', 'いまは気配を探せません。少し歩いてから開き直してね'],
  ['error', '気配を読み込めませんでした'],
] as const)('状態 %s の文', (status, text) => {
  show({ status })
  expect(screen.getByText(text)).toBeInTheDocument()
})

test('error には「もう一度」ボタン', async () => {
  const p = show({ status: 'error' })
  await userEvent.click(screen.getByRole('button', { name: 'もう一度' }))
  expect(p.onRetry).toHaveBeenCalled()
})

test('3件でヒントと距離が出て、店名は出ない', async () => {
  const hints = [hint('a'), hint('b', { genre: 'カフェ' }), hint('c', { isMystery: true, genre: null, catch: null, budget: null })]
  const p = show({ set: setOf(hints), distances: new Map([['a', 400]]), directions: new Map([['a', '北東']]) })
  expect(screen.getByText('中華？')).toBeInTheDocument()
  expect(screen.getAllByText('…自家製麺の濃厚つけ麺…').length).toBe(2)
  expect(screen.getAllByText('予算 1,000円台').length).toBeGreaterThan(0)
  expect(screen.getByText('北東へ 約400m')).toBeInTheDocument() // 方角つきの距離
  expect(screen.getAllByText('+40').length).toBe(3) // ごほうび（チェックイン30＋気配10）
  expect(screen.getByText(/霧の中に 3つの気配/)).toBeInTheDocument()
  expect(screen.getByText('謎の気配')).toBeInTheDocument()
  expect(screen.getByText('正体は行ってみてのお楽しみ')).toBeInTheDocument()
  expect(document.body.textContent).not.toContain('秘密亭')
  await userEvent.click(screen.getByRole('button', { name: /中華？/ }))
  expect(p.onPickHint).toHaveBeenCalledWith('a')
})

test('達成は店名と「達成 +40」、明かした気配は店名', () => {
  show({ set: setOf([hint('a', { completed: true }), hint('b'), hint('c')]), revealed: new Set(['b']) })
  expect(screen.getByText('『秘密亭a』')).toBeInTheDocument()
  expect(screen.getByText('達成 +40')).toBeInTheDocument()
  expect(screen.getByText(/霧の中に 2つの気配/)).toBeInTheDocument()
  expect(screen.getByText('『秘密亭b』')).toBeInTheDocument()
  expect(document.body.textContent).not.toContain('秘密亭c')
})

test('探し直すボタンは regenVisible のときだけ。fast なら押せず案内が出る', async () => {
  const set = setOf([hint('a')])
  const { unmount } = render(<ExploreSheet {...base()} set={set} />)
  expect(screen.queryByRole('button', { name: 'この辺りで探し直す' })).toBeNull()
  unmount()
  const p = show({ set, regenVisible: true })
  await userEvent.click(screen.getByRole('button', { name: 'この辺りで探し直す' }))
  expect(p.onRegen).toHaveBeenCalled()
})

test('fast のときは探し直すボタンが押せず「降りてから探し直してね」', () => {
  show({ set: setOf([hint('a')]), regenVisible: true, fast: true })
  expect(screen.getByRole('button', { name: 'この辺りで探し直す' })).toBeDisabled()
  expect(screen.getByText('降りてから探し直してね')).toBeInTheDocument()
})

test('気配なしの日: 「今日は気配なし」と案内。押すとお店へ', async () => {
  const shop: Shop = { id: 's', name: '食堂まる', lat: 35, lng: 139, kind: 'washoku', details: null, mapId: null }
  const p = show({ set: setOf([], { generation: 0 }), guide: [{ shop, distanceM: 123 }] })
  expect(screen.getByText('今日は気配なし')).toBeInTheDocument()
  expect(screen.getByText('近くのまだ行っていないお店')).toBeInTheDocument()
  expect(screen.getByText('約100m')).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: /食堂まる/ }))
  expect(p.onPickShop).toHaveBeenCalledWith(shop)
})

test('案内が無ければ「近くにまだ行っていないお店はありません」', () => {
  show({ set: setOf([], { generation: 0 }) })
  expect(screen.getByText('近くにまだ行っていないお店はありません')).toBeInTheDocument()
})

test('notice・毎日0時の文が出る（クレジットは気配のシートに出さない）', () => {
  show({ set: setOf([hint('a')]), notice: 'この辺りには気配がありませんでした' })
  expect(screen.getByText('この辺りには気配がありませんでした')).toBeInTheDocument()
  expect(screen.getByText('気配は毎日0時に入れかわります')).toBeInTheDocument()
  expect(screen.queryByText('Powered by ホットペッパーグルメ Webサービス')).not.toBeInTheDocument()
})
