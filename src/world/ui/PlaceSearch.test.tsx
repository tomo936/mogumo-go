import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import type { Place } from '../domain/gsi.ts'
import { PlaceSearch } from './PlaceSearch.tsx'

const P = (title: string): Place => ({ title, lat: 41, lng: 140 })
beforeEach(() => { vi.useFakeTimers() })
afterEach(() => { vi.useRealTimers() })

const type = (v: string) => fireEvent.change(screen.getByLabelText('地名で探す'), { target: { value: v } })
const tick = async (ms: number) => { await act(async () => { await vi.advanceTimersByTimeAsync(ms) }) }

test('400ms 止まると 1 回検索し、候補と出典が出て、押すと onPick', async () => {
  const search = vi.fn(async () => [P('函館市'), P('函館山'), P('函館駅')])
  const onPick = vi.fn()
  render(<PlaceSearch onPick={onPick} onBack={() => {}} search={search} />)
  type('函館')
  await tick(399)
  expect(search).not.toHaveBeenCalled()
  await tick(2)
  expect(search).toHaveBeenCalledTimes(1)
  expect(screen.getByText('函館山')).toBeInTheDocument()
  expect(screen.getByText('地名検索: 国土地理院')).toBeInTheDocument()
  fireEvent.click(screen.getByText('函館山'))
  expect(onPick).toHaveBeenCalledWith(P('函館山'))
})

test('続けて打つと最後の言葉で 1 回だけ', async () => {
  const search = vi.fn(async () => [])
  render(<PlaceSearch onPick={() => {}} onBack={() => {}} search={search} />)
  type('函')
  await tick(100)
  type('函館')
  await tick(500)
  expect(search).toHaveBeenCalledTimes(1)
  expect((search.mock.calls[0] as unknown[])[0]).toBe('函館')
})

test('遅い 1 回目の返事が後から来ても表示は 2 回目のまま', async () => {
  let resolveFirst: (p: Place[]) => void = () => {}
  const search = vi.fn((q: string) => (q === '函館' ? new Promise<Place[]>((r) => { resolveFirst = r }) : Promise.resolve([P('札幌市')])))
  render(<PlaceSearch onPick={() => {}} onBack={() => {}} search={search} />)
  type('函館')
  await tick(450)
  type('札幌')
  await tick(450)
  expect(screen.getByText('札幌市')).toBeInTheDocument()
  await act(async () => { resolveFirst([P('函館市')]) })
  expect(screen.queryByText('函館市')).toBeNull()
  expect(screen.getByText('札幌市')).toBeInTheDocument()
})

test('失敗は「探せませんでした」', async () => {
  render(<PlaceSearch onPick={() => {}} onBack={() => {}} search={async () => { throw new Error('x') }} />)
  type('函館')
  await tick(450)
  expect(screen.getByText('探せませんでした')).toBeInTheDocument()
})

test('←で onBack', () => {
  const onBack = vi.fn()
  render(<PlaceSearch onPick={() => {}} onBack={onBack} search={async () => []} />)
  fireEvent.click(screen.getByLabelText('記録へ戻る'))
  expect(onBack).toHaveBeenCalled()
})
