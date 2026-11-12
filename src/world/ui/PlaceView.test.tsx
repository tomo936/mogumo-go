import { act, fireEvent, render, screen } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import type { VisitEntry } from '../../record/domain/timeline.ts'
import type { DayPin } from '../../record/domain/dayPins.ts'

let lastPins: DayPin[] = []
let tap: ((id: string) => void) | undefined
vi.mock('../../record/ui/RecordMap.tsx', () => ({
  RecordMap: (p: { pins: DayPin[]; onPinTap?: (id: string) => void }) => {
    lastPins = p.pins
    tap = p.onPinTap
    return <div data-testid="record-map" />
  },
}))

import { PlaceView } from './PlaceView.tsx'

const v = (shopId: string, day: string, lat: number | null): VisitEntry => ({
  shopId, name: `店${shopId}`, kind: 'ramen', photoUrl: null, day, at: Date.parse(`${day}T03:00:00Z`), lat, lng: lat === null ? null : 139, wasHint: false, mysteryHint: false,
})
const setup = (visits: VisitEntry[], over: { onBack?: () => void; onReturn?: () => void } = {}) =>
  render(<PlaceView center={{ lat: 35, lng: 139 }} zoom={15} cells={[]} towns={[]} visits={visits} home={null} onBack={over.onBack ?? (() => {})} onReturn={over.onReturn ?? (() => {})} />)

test('位置の無い訪問はピンにしない。同じ店 3 回は 1 ピン', () => {
  setup([v('a', '2026-10-01', 35), v('a', '2026-10-02', 35), v('a', '2026-10-03', 35), v('b', '2026-10-01', null)])
  expect(lastPins.map((p) => p.shopId)).toEqual(['a'])
  expect(lastPins[0].lastDay).toBe('2026-10-03')
})

test('「見ているだけ」の帯は出さない。左上の「ワールドマップ」で戻る・「今いる場所に戻る」', () => {
  const onBack = vi.fn()
  const onReturn = vi.fn()
  setup([], { onBack, onReturn })
  expect(screen.queryByText(/見ているだけ/)).toBeNull()
  expect(screen.queryByText(/チェックインはできません/)).toBeNull()
  fireEvent.click(screen.getByText('今いる場所に戻る'))
  expect(onReturn).toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'ワールドマップへ戻る' }))
  expect(onBack).toHaveBeenCalled()
})

test('お店のシートを開いているあいだは「今いる場所に戻る」を隠す', () => {
  setup([v('a', '2026-10-01', 35)])
  expect(screen.getByText('今いる場所に戻る')).toBeInTheDocument()
  act(() => tap?.('a'))
  expect(screen.queryByText('今いる場所に戻る')).toBeNull()
})

test('ピンを押すとシートが出て、チェックインのボタンは無い', () => {
  setup([v('a', '2026-10-01', 35), v('a', '2026-10-05', 35)])
  act(() => tap?.('a'))
  expect(screen.getByText('店a')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /チェックイン/ })).toBeNull()
})
