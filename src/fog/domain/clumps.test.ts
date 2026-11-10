import { describe, expect, it } from 'vitest'
import { CLUMP_EDGE_M, CLUMP_MAX_M, FOG_HALF_M } from '../config.ts'
import { clearedFromHome } from './clearing.ts'
import { drawOrder, farClumps, fogClumps } from './clumps.ts'
import type { Clump } from './clumps.ts'
import { cellKey, cellOf, cellsInCircle, M_PER_DEG_LAT } from './grid.ts'

const home = { lat: 35.68, lng: 139.76 }
const mLng = M_PER_DEG_LAT * Math.cos((home.lat * Math.PI) / 180)
const mLngAt = (lat: number) => M_PER_DEG_LAT * Math.cos((lat * Math.PI) / 180)
const abs = (o: typeof home, c: Clump) => ({ lat: o.lat + c.y / M_PER_DEG_LAT, lng: o.lng + c.x / mLngAt(o.lat) })

describe('fogClumps', () => {
  it('晴れが無ければ範囲いっぱいに塊を置き、範囲の外には置かない', () => {
    const cs = fogClumps(home, new Set())
    expect(cs.length).toBeGreaterThan(3000)
    for (const c of cs) {
      expect(Math.abs(c.x)).toBeLessThanOrEqual(FOG_HALF_M)
      expect(Math.abs(c.y)).toBeLessThanOrEqual(FOG_HALF_M)
      expect(c.w).toBeLessThanOrEqual(CLUMP_MAX_M)
    }
  })

  it('中心が晴れたセルにある塊は置かず、晴れたセルの中心に近いほど小さい', () => {
    const cleared = clearedFromHome(home)
    const cs = fogClumps(home, cleared)
    const centers = [...cleared].map((k) => k.split(':').map(Number))
    for (const c of cs) {
      const p = abs(home, c)
      expect(cleared.has(cellKey(cellOf(p)))).toBe(false)
      // 端（中心から 0.8w）が、晴れたセルの中心から CLUMP_EDGE_M より近づかない
      const d = Math.min(...centers.map(([x, y]) => {
        const cy = (y + 0.5) * (25 / M_PER_DEG_LAT)
        const cx = (x + 0.5) * (25 / (M_PER_DEG_LAT * Math.cos((35 * Math.PI) / 180)))
        return Math.hypot((cx - p.lng) * mLng, (cy - p.lat) * M_PER_DEG_LAT)
      }))
      expect(d - c.w * 0.8).toBeGreaterThanOrEqual(CLUMP_EDGE_M - 0.01)
    }
  })

  it('現在地が変わっても、同じ場所には同じ塊が出る（世界に固定）', () => {
    const other = { lat: home.lat + 300 / M_PER_DEG_LAT, lng: home.lng + 200 / mLng }
    const key = (o: typeof home, c: Clump) => {
      const p = abs(o, c)
      return `${Math.round(p.lat * M_PER_DEG_LAT)}:${Math.round(p.lng * mLng)}:${c.seed.toFixed(4)}`
    }
    const a = new Set(fogClumps(home, new Set()).filter((c) => Math.hypot(c.x, c.y) < 300).map((c) => key(home, c)))
    const b = new Set(fogClumps(other, new Set()).map((c) => key(other, c)))
    expect(a.size).toBeGreaterThan(100)
    for (const k of a) expect(b.has(k)).toBe(true)
  })

  it('町全体くらい晴れていても速い（1万セルで 1 秒未満。桁違いの遅くなりだけ見る）', () => {
    const cleared = new Set(cellsInCircle(home, 1400).map(cellKey))
    expect(cleared.size).toBeGreaterThan(9000)
    const t = performance.now()
    fogClumps(home, cleared)
    expect(performance.now() - t).toBeLessThan(1000)
  })
})

describe('drawOrder', () => {
  const n: Clump = { x: 0, y: 100, w: 30, seed: 1 }
  const s: Clump = { x: 0, y: -100, w: 30, seed: 2 }
  const e: Clump = { x: 100, y: 0, w: 30, seed: 3 }

  it('北が上なら北（奥）から描く', () => {
    expect(drawOrder([s, e, n], 0)).toEqual([n, e, s])
  })

  it('南が上（180度）なら南から、東が上（90度）なら東から描く', () => {
    expect(drawOrder([n, s], 180)[0]).toBe(s)
    expect(drawOrder([n, s, e], 90)[0]).toBe(e)
  })
})

describe('farClumps', () => {
  const o = { lat: 35.65, lng: 139.63 }
  it('近くの範囲の内側には置かず、遠くの範囲いっぱいまで置く', () => {
    const far = farClumps(o)
    expect(far.length).toBeGreaterThan(1000)
    expect(far.length).toBeLessThan(5000)
    expect(far.every((c) => Math.abs(c.x) >= 1100 || Math.abs(c.y) >= 1100)).toBe(true)
    expect(far.some((c) => Math.abs(c.y) > 3000)).toBe(true)
  })
  it('原点が少し動いても、同じ場所に同じ塊が出る', () => {
    const a = farClumps(o)
    const b = farClumps({ lat: o.lat + 0.0003, lng: o.lng })
    const abs = (c: { y: number }, p: typeof o) => c.y + p.lat * M_PER_DEG_LAT
    const keyA = new Set(a.map((c) => abs(c, o).toFixed(0)))
    const hit = b.filter((c) => keyA.has(abs(c, { lat: o.lat + 0.0003, lng: o.lng }).toFixed(0))).length
    expect(hit).toBeGreaterThan(b.length * 0.9)
  })
})
