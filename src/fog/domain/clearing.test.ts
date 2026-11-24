import { describe, expect, it, test } from 'vitest'
import { clearedFromHome, isClearedAt } from './clearing.ts'

const home = { lat: 35.68, lng: 139.76 }
const north = (m: number) => ({ lat: home.lat + m / 111195, lng: home.lng })

describe('clearedFromHome', () => {
  it('null は空', () => {
    expect(clearedFromHome(null).size).toBe(0)
  })
  it('150m は晴れ、260m は霧', () => {
    const c = clearedFromHome(home)
    expect(isClearedAt(c, north(150))).toBe(true)
    expect(isClearedAt(c, north(260))).toBe(false)
  })
})

test('雲を置かない所: 晴れたセルに立つお店のまわり 1 セルを足す。霧の中のお店は足さない（2026-11-24）', async () => {
  const { cloudFree } = await import('./clearing.ts')
  const { cellKey, cellOf } = await import('./grid.ts')
  const shop = { lat: 35.65, lng: 139.63 }
  const c = cellOf(shop)
  const cleared = new Set([cellKey(c)])
  const free = cloudFree(cleared, [shop])
  expect(free.size).toBe(9)
  expect(free.has(cellKey({ x: c.x + 1, y: c.y + 1 }))).toBe(true)
  expect(cloudFree(new Set(), [shop]).size).toBe(0)
})
