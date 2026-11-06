import { describe, expect, it } from 'vitest'
import { clearedFromHome, distanceToCleared } from './clearing.ts'
import { chunkOf, cloudSpots } from './cloudSpots.ts'
import { distanceMeters } from '../../map/domain/geo.ts'
import { CLOUD_CLEAR_MARGIN_M, CLOUD_REACH_M } from '../config.ts'

const home = { lat: 35.68, lng: 139.76 }
const cleared = clearedFromHome(home)
const empty = new Set<string>()

describe('cloudSpots', () => {
  it('同じ入力なら同じ結果', () => {
    expect(cloudSpots(home, cleared)).toEqual(cloudSpots(home, cleared))
  })
  it('中心をずらしても共通範囲の雲は同じ', () => {
    const moved = { lat: home.lat + 30 / 111195, lng: home.lng }
    const a = cloudSpots(home, cleared)
    const b = cloudSpots(moved, cleared)
    const key = (s: { lat: number; lng: number }) => `${s.lat},${s.lng}`
    const bMap = new Map(b.map((s) => [key(s), s]))
    const common = a.filter((s) => distanceMeters(home, s) < 1400)
    expect(common.length).toBeGreaterThan(1000)
    for (const s of common) expect(bMap.get(key(s))).toEqual(s)
  })
  it('中心を経度方向に 30m ずらしても共通範囲の雲は同じ', () => {
    const moved = { lat: home.lat, lng: home.lng + 30 / (111195 * Math.cos((home.lat * Math.PI) / 180)) }
    const a = cloudSpots(home, cleared)
    const bMap = new Map(cloudSpots(moved, cleared).map((s) => [`${s.lat},${s.lng}`, s]))
    const common = a.filter((s) => distanceMeters(home, s) < 1400)
    for (const s of common) expect(bMap.get(`${s.lat},${s.lng}`)).toEqual(s)
  })
  it('晴れがあっても 1 回の計算は 200ms 未満', () => {
    cloudSpots(home, cleared) // warm up
    const t0 = performance.now()
    cloudSpots(home, cleared)
    const ms = performance.now() - t0
    console.log(`cloudSpots with cleared: ${ms.toFixed(1)}ms`)
    expect(ms).toBeLessThan(200)
  })
  it('晴れから margin 以内に雲は無い', () => {
    for (const s of cloudSpots(home, cleared)) {
      expect(distanceToCleared(cleared, s, 400)).toBeGreaterThan(CLOUD_CLEAR_MARGIN_M)
    }
  })
  it('どの雲も reach 以内', () => {
    for (const s of cloudSpots(home, cleared)) {
      expect(distanceMeters(home, s)).toBeLessThanOrEqual(CLOUD_REACH_M)
    }
  })
  it('晴れが無いときの雲の数', () => {
    const n = cloudSpots(home, empty).length
    expect(n).toBeGreaterThanOrEqual(1500)
    expect(n).toBeLessThanOrEqual(2600)
  })
  it('晴れに近い雲ほど低い', () => {
    const spots = cloudSpots(home, cleared)
    const d = (s: (typeof spots)[number]) => distanceToCleared(cleared, s, 400)
    const near = spots.filter((s) => d(s) < 80)
    const far = spots.filter((s) => d(s) >= 400)
    expect(near.length).toBeGreaterThan(0)
    expect(far.length).toBeGreaterThan(0)
    expect(Math.max(...near.map((s) => s.heightM))).toBeLessThan(Math.max(...far.map((s) => s.heightM)))
  })
})

describe('chunkOf', () => {
  const spot = (lat: number, lng: number) => ({ lat, lng, widthM: 1, heightM: 1, rotRad: 0, kind: 0 as const })
  it('近い2点は同じ、600m 離れると違う', () => {
    const a = spot(home.lat, home.lng)
    expect(chunkOf(a)).toBe(chunkOf(spot(home.lat + 5 / 111195, home.lng)))
    expect(chunkOf(a)).not.toBe(chunkOf(spot(home.lat + 600 / 111195, home.lng)))
  })
  it('負のセル番号をまたぐ（経度 0 付近）', () => {
    const w = spot(10, -0.00001)
    const e = spot(10, 0.00001)
    expect(chunkOf(w)).not.toBe(chunkOf(e))
    expect(chunkOf(w)).toBe(chunkOf(spot(10, -0.00002)))
  })
})
