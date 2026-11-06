import { describe, expect, it } from 'vitest'
import { cellsInCircle } from '../../../src/fog/domain/grid.ts'
import { distanceMeters } from '../../../src/map/domain/geo.ts'
import { CHECKIN_M, CLEAR_M, cellsAround, distanceM, findPoi, jstDay, tileXY, tilesToTry } from './core.ts'

const sortCells = (c: [number, number][]) => [...c].sort((a, b) => a[0] - b[0] || a[1] - b[1])

describe('cellsAround', () => {
  it('クライアントの cellsInCircle と同じセル', () => {
    for (const [lat, lng] of [[35.6909, 139.7003], [34.7, 135.5], [43.06, 141.35]]) {
      const client = cellsInCircle({ lat, lng }, 200).map((c): [number, number] => [c.x, c.y])
      expect(sortCells(cellsAround(lat, lng, CLEAR_M))).toEqual(sortCells(client))
    }
  })
})

describe('distanceM / CHECKIN_M', () => {
  const o = { lat: 35.6909, lng: 139.7003 }
  const north = (m: number) => ({ lat: o.lat + m / 111195, lng: o.lng })
  it('geo.ts と同じ距離', () => {
    expect(distanceM(o, north(300))).toBeCloseTo(distanceMeters(o, north(300)), 6)
  })
  it('49.9m は範囲内、50.1m は範囲外', () => {
    expect(distanceM(o, north(49.9)) <= CHECKIN_M).toBe(true)
    expect(distanceM(o, north(50.1)) <= CHECKIN_M).toBe(false)
  })
})

describe('jstDay', () => {
  it('JST 0時で切る', () => {
    expect(jstDay(new Date('2026-11-06T14:59:59Z'))).toBe('2026-11-06')
    expect(jstDay(new Date('2026-11-06T15:00:00Z'))).toBe('2026-11-07')
  })
})

describe('tileXY', () => {
  it('標準のスリッピーマップ式', () => {
    expect(tileXY(35.6909, 139.7003, 14)).toEqual({ x: 14549, y: 6451 })
  })
})

describe('tilesToTry', () => {
  it('タイルの真ん中なら1枚だけ', () => {
    // 14549,6451 の中心付近
    const t = tileXY(35.6909, 139.7003, 14)
    const r = tilesToTry(35.6909, 139.7003, 14, 60)
    expect(r).toHaveLength(1)
    expect(r[0]).toEqual(t)
  })
  it('西端から 60m 以内なら西隣も試す', () => {
    const lng = (14549 / 2 ** 14) * 360 - 180 // 西端
    const r = tilesToTry(35.6909, lng + 30 / (111195 * Math.cos((35.6909 * Math.PI) / 180)), 14, 60)
    expect(r[0]).toEqual({ x: 14549, y: expect.any(Number) })
    expect(r.some((t) => t.x === 14548)).toBe(true)
    expect(r.some((t) => t.x === 14550)).toBe(false)
  })
  it('四隅なら斜めも含む', () => {
    const lng = (14549 / 2 ** 14) * 360 - 180
    const n = Math.PI - (2 * Math.PI * 6451) / 2 ** 14
    const lat = (Math.atan(Math.sinh(n)) * 180) / Math.PI
    const r = tilesToTry(lat - 0.0001, lng + 0.0001, 14, 60)
    expect(r).toHaveLength(4)
  })
})

describe('findPoi', () => {
  const fs = [
    { id: 123, name: 'カフェA', subclass: 'cafe', lng: 139.7, lat: 35.69 },
    { id: 456, name: 'P', subclass: 'parking', lng: 139.7, lat: 35.69 },
    { id: '789', name: 'ラーメン', subclass: 'restaurant', lng: 139.71, lat: 35.7 },
    { id: 55, name: '', subclass: 'cafe', lng: 1, lat: 1 },
  ]
  it('osm:123 を見つける', () => {
    expect(findPoi(fs, 'osm:123')).toEqual({ name: 'カフェA', subclass: 'cafe', lng: 139.7, lat: 35.69 })
    expect(findPoi(fs, 'osm:789')?.name).toBe('ラーメン')
  })
  it('飲食店でないものは無視', () => {
    expect(findPoi(fs, 'osm:456')).toBeNull()
  })
  it('同じ id の parking は飛ばし、後ろの飲食店を返す', () => {
    const dup = [
      { id: 7, name: 'P', subclass: 'parking', lng: 1, lat: 1 },
      { id: 7, name: '店', subclass: 'cafe', lng: 2, lat: 3 },
    ]
    expect(findPoi(dup, 'osm:7')).toEqual({ name: '店', subclass: 'cafe', lng: 2, lat: 3 })
  })
  it('名前なし・未知の id・osm: でない id は null', () => {
    expect(findPoi(fs, 'osm:55')).toBeNull()
    expect(findPoi(fs, 'osm:999')).toBeNull()
    expect(findPoi(fs, 'hp:123')).toBeNull()
  })
})
