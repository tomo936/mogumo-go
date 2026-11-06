import { describe, expect, it } from 'vitest'
import { distanceMeters } from '../../map/domain/geo.ts'
import { farFromHome } from './far.ts'

const home = { lat: 35.68, lng: 139.76 }
// 真北へ m メートル離れた点（二分探索で距離を合わせる）
function north(m: number) {
  let lo = 0
  let hi = 0.01
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2
    if (distanceMeters(home, { lat: home.lat + mid, lng: home.lng }) < m) lo = mid
    else hi = mid
  }
  return { lat: home.lat + hi, lng: home.lng }
}

describe('farFromHome', () => {
  it('499 m は false', () => expect(farFromHome(home, north(499))).toBe(false))
  it('500 m ちょうどは true', () => expect(farFromHome(home, north(500))).toBe(true))
  it('自宅が無ければ false', () => expect(farFromHome(null, north(5000))).toBe(false))
})
