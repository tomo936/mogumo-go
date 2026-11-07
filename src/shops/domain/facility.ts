// 大型施設の立体の材料（どの輪郭を、どの高さで立ち上げるか）と、駅の点の判定
import type { P } from '../../map/domain/geo.ts'
import { FACILITY_FLOOR_M, FACILITY_HEIGHT_RATE, FACILITY_MAX_H_M, FACILITY_MIN_H_M } from '../config.ts'

export type FacilityPart = { pts: P[]; heightM: number }

function inside(p: P, ring: P[]): boolean {
  let c = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i]
    const b = ring[j]
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) c = !c
  }
  return c
}

const cross = (o: P, a: P, b: P) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x)
function segsCross(a: P, b: P, c: P, d: P): boolean {
  return cross(c, d, a) * cross(c, d, b) < 0 && cross(a, b, c) * cross(a, b, d) < 0
}

// 2つの輪郭の形が重なるか（頂点がもう一方の中にある・辺が交わる）
function overlaps(a: P[], b: P[]): boolean {
  if (a.some((p) => inside(p, b)) || b.some((p) => inside(p, a))) return true
  for (let i = 1; i < a.length; i++) for (let j = 1; j < b.length; j++) if (segsCross(a[i - 1], a[i], b[j - 1], b[j])) return true
  return false
}

// タイルの高さを、かわいく見える高さに縮める
export const cuteHeight = (h: number) => Math.max(FACILITY_MIN_H_M, Math.min(FACILITY_MAX_H_M, h * FACILITY_HEIGHT_RATE))

// main と、main と形が重なる輪郭（タイルの区切りのかけら・高さ違いの部分）。最初が main。
// 同じ高さになった部分は少しずつ高くして、屋根がちらつかないようにする
export function facilityParts(mainIndex: number, rings: P[][], heights: number[]): FacilityPart[] {
  const main = rings[mainIndex]
  const picked = [mainIndex, ...rings.flatMap((r, i) => (i !== mainIndex && overlaps(main, r) ? [i] : []))]
  const used: number[] = []
  return picked.map((i) => {
    let h = cuteHeight(heights[i])
    while (used.some((u) => Math.abs(u - h) < 0.01)) h = Math.round((h + 0.05) * 100) / 100
    used.push(h)
    return { pts: rings[i], heightM: h }
  })
}

// 窓の帯の数
export const floors = (heightM: number) => Math.max(1, Math.round(heightM / FACILITY_FLOOR_M))

// どれかの部分の中にある最初の駅の点
export function stationIn(parts: FacilityPart[], stations: P[]): P | null {
  return stations.find((s) => parts.some((p) => inside(s, p.pts))) ?? null
}
