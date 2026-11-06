import { describe, expect, it } from 'vitest'
import { clearedFromHome, distanceToCleared, isClearedAt } from './clearing.ts'

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

describe('distanceToCleared', () => {
  const c = clearedFromHome(home)
  it('自宅の上では 25 未満', () => {
    expect(distanceToCleared(c, home, 400)).toBeLessThan(25)
  })
  it('400m 離れた点では 180〜230', () => {
    const d = distanceToCleared(c, north(400), 400)
    expect(d).toBeGreaterThanOrEqual(180)
    expect(d).toBeLessThanOrEqual(230)
  })
  it('maxM 内に無ければ Infinity', () => {
    expect(distanceToCleared(c, north(400), 100)).toBe(Infinity)
  })
})
