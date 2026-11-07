import { expect, test } from 'vitest'
import { clusterSpots, pinLayout, pinScale } from './pins.ts'

test('3軒・ズーム17は3つで、中央が一番高い', () => {
  const r = pinLayout(3, 17, false)
  if (r === 'collapsed' || r === 'scatter') throw new Error(r)
  expect(r.pins.map((p) => p.x)).toEqual([-34, 0, 34])
  expect(r.pins[1].y).toBeLessThan(r.pins[0].y)
  expect(r.pins[0].y).toBe(r.pins[2].y)
  expect(r.more).toBe(0)
})

test('ズーム15.9は collapsed', () => {
  expect(pinLayout(3, 15.9, false)).toBe('collapsed')
})

test('小さいビルに8軒なら5つ並べて残り3', () => {
  const r = pinLayout(8, 19, false)
  if (r === 'collapsed' || r === 'scatter') throw new Error(r)
  expect(r.pins).toHaveLength(5)
  expect(r.more).toBe(3)
})

test('大型の施設は 17.5 未満で collapsed、17.5 以上で scatter', () => {
  expect(pinLayout(2, 17.4, true)).toBe('collapsed')
  expect(pinLayout(2, 18, true)).toBe('scatter')
})

test('clusterSpots: 1m の2軒は1つの塊（位置は平均）、30m 離れれば別', () => {
  const r = clusterSpots([{ id: 'a', x: 0, y: 0 }, { id: 'b', x: 1, y: 0 }, { id: 'c', x: 30, y: 0 }], 5)
  expect(r).toEqual([{ ids: ['a', 'b'], x: 0.5, y: 0 }, { ids: ['c'], x: 30, y: 0 }])
})

test('ピンの列がビルの幅（9割）に収まる大きさ', () => {
  // 幅 16m・1m=4px のビル（64px）に3つ: 列の幅 34*2+30=98px → 64*0.9/98
  expect(pinScale(16, 4, 3)).toBeCloseTo((64 * 0.9) / 98, 5)
})

test('近くても元の大きさより大きくせず、遠くても 0.3 より小さくしない', () => {
  expect(pinScale(16, 40, 1)).toBe(1)
  expect(pinScale(16, 0.1, 5)).toBe(0.3)
})
