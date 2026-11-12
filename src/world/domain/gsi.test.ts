import { describe, expect, it } from 'vitest'
import { parsePlaces } from './gsi.ts'

const item = (title: string, lng: unknown, lat: unknown) => ({ geometry: { coordinates: [lng, lat] }, properties: { title } })

describe('parsePlaces', () => {
  it('正常 2 件', () => {
    expect(parsePlaces([item('函館市', 140.7, 41.7), item('函館山', 140.7, 41.76)], 8)).toEqual([
      { title: '函館市', lng: 140.7, lat: 41.7 },
      { title: '函館山', lng: 140.7, lat: 41.76 },
    ])
  })
  it('配列でなければ空', () => {
    expect(parsePlaces(null, 8)).toEqual([])
    expect(parsePlaces({}, 8)).toEqual([])
  })
  it('座標が文字列・title 無しは捨てる', () => {
    expect(parsePlaces([item('x', '1', '2'), { geometry: { coordinates: [1, 2] }, properties: {} }, null, item('ok', 1, 2)], 8)).toEqual([
      { title: 'ok', lng: 1, lat: 2 },
    ])
  })
  it('limit で切る', () => {
    expect(parsePlaces(Array.from({ length: 12 }, (_, i) => item(`p${i}`, 1, 2)), 8)).toHaveLength(8)
  })
})
