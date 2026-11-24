import { describe, expect, it } from 'vitest'
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
