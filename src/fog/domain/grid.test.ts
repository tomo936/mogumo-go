import { describe, expect, it } from 'vitest'
import { distanceMeters } from '../../map/domain/geo.ts'
import { cellCenter, cellKey, cellOf, cellsInCircle } from './grid.ts'

const tokyo = { lat: 35.6812, lng: 139.7671 }

describe('grid', () => {
  it('セルの中心からセルに戻る（負の番号も）', () => {
    expect(cellOf(cellCenter({ x: 5585, y: -2 }))).toEqual({ x: 5585, y: -2 })
    expect(cellOf(cellCenter({ x: -7, y: -9 }))).toEqual({ x: -7, y: -9 })
  })

  it('東京駅のセルの中心は18m以内', () => {
    expect(distanceMeters(tokyo, cellCenter(cellOf(tokyo)))).toBeLessThan(18)
  })

  it('cellKey', () => {
    expect(cellKey({ x: 3, y: -4 })).toBe('3:-4')
  })

  it('cellsInCircle は円の中の中心だけ', () => {
    const cells = cellsInCircle(tokyo, 200)
    expect(cells.length).toBeGreaterThanOrEqual(160)
    expect(cells.length).toBeLessThanOrEqual(220)
    for (const c of cells) expect(distanceMeters(tokyo, cellCenter(c))).toBeLessThanOrEqual(200)
  })

  it('半径0は空', () => {
    expect(cellsInCircle(tokyo, 0)).toEqual([])
  })
})
