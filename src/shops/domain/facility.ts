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

type Box = { x0: number; y0: number; x1: number; y1: number }
function boxOf(r: P[]): Box {
  const b = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity }
  for (const p of r) {
    b.x0 = Math.min(b.x0, p.x)
    b.y0 = Math.min(b.y0, p.y)
    b.x1 = Math.max(b.x1, p.x)
    b.y1 = Math.max(b.y1, p.y)
  }
  return b
}
const area = (r: P[]) => Math.abs(r.reduce((s, q, i) => s + (q.x * r[(i + 1) % r.length].y - r[(i + 1) % r.length].x * q.y), 0) / 2)
const BIG_RATE = 3 // main のこれ倍より広い輪郭は、隣の別の大きな建物とみなして入れない

// 2つの輪郭の形が重なるか（頂点がもう一方の中にある・辺が交わる）。先に囲む箱で大まかにふるい分ける
function overlaps(a: P[], b: P[], ab: Box, bb: Box): boolean {
  if (ab.x1 < bb.x0 || bb.x1 < ab.x0 || ab.y1 < bb.y0 || bb.y1 < ab.y0) return false
  if (a.some((p) => inside(p, b)) || b.some((p) => inside(p, a))) return true
  for (let i = 1; i < a.length; i++) for (let j = 1; j < b.length; j++) if (segsCross(a[i - 1], a[i], b[j - 1], b[j])) return true
  return false
}

// タイルの高さを、かわいく見える高さに縮める
export const cuteHeight = (h: number) => Math.max(FACILITY_MIN_H_M, Math.min(FACILITY_MAX_H_M, h * FACILITY_HEIGHT_RATE))

// main と、main と形が重なる輪郭（タイルの区切りのかけら・高さ違いの部分。main の3倍より広いものは除く）。最初が main。
// 同じ高さの部分は同じ高さのまま（ずらすと段差の線が見える。同じ色なのでちらつきは見えない）
export function facilityParts(mainIndex: number, rings: P[][], heights: number[]): FacilityPart[] {
  const main = rings[mainIndex]
  const mb = boxOf(main)
  const limit = area(main) * BIG_RATE
  const picked = [mainIndex, ...rings.flatMap((r, i) => (i !== mainIndex && overlaps(main, r, mb, boxOf(r)) && area(r) <= limit ? [i] : []))]
  return picked.map((i) => ({ pts: rings[i], heightM: cuteHeight(heights[i]) }))
}

// 窓の帯の数
export const floors = (heightM: number) => Math.max(1, Math.round(heightM / FACILITY_FLOOR_M))

// どれかの部分の中にある最初の駅の点
export function stationIn(parts: FacilityPart[], stations: P[]): P | null {
  return stations.find((s) => parts.some((p) => inside(s, p.pts))) ?? null
}

// 入口の位置: 真ん中から正面の向き（北0・時計回り）へ進んで、輪郭を出た所
export function doorPoint(center: P, facingDeg: number, ring: P[]): P {
  const r = (facingDeg * Math.PI) / 180
  const dir = { x: Math.sin(r), y: Math.cos(r) }
  const at = (t: number) => ({ x: center.x + dir.x * t, y: center.y + dir.y * t })
  let t = 0
  while (t < 500 && inside(at(t), ring)) t += 1
  // 1m 刻みで出たので、最後の 1m を半分ずつ詰める
  let lo = Math.max(0, t - 1)
  for (let i = 0; i < 8; i++) {
    const mid = (lo + t) / 2
    if (inside(at(mid), ring)) lo = mid
    else t = mid
  }
  return { x: center.x + dir.x * t, y: center.y + dir.y * t }
}

// 屋根のふちを付ける辺: ほかの部分の中に入っている辺（タイルの区切りのつなぎ目など）は除く
export function outerEdges(parts: FacilityPart[]): { a: P; b: P; heightM: number }[] {
  const out: { a: P; b: P; heightM: number }[] = []
  parts.forEach((part, k) => {
    for (let i = 1; i < part.pts.length; i++) {
      const a = part.pts[i - 1]
      const b = part.pts[i]
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
      if (parts.some((o, j) => j !== k && inside(mid, o.pts))) continue
      out.push({ a, b, heightM: part.heightM })
    }
  })
  return out
}

// 名前つきの点（駅・施設）。p は m
export type Mark = { p: P; name: string; kind: 'station' | 'facility' }

// 施設の種類（駅の点があれば駅）と名前の札。点は本体（parts[0]）の中にあるものだけ数える（重なった別の建物の点を拾わない）。
// 駅の点は、それを含むもっと大きな輪郭（rings のうち parts でないもの）があればそちらの駅にする
export function facilityLabel(parts: FacilityPart[], marks: Mark[], rings: P[][]): { kind: 'station' | 'facility'; name: string | null } {
  const inParts = (p: P) => inside(p, parts[0].pts)
  const mainArea = area(parts[0].pts)
  const own = new Set(parts.map((q) => q.pts))
  const stations = marks.filter((m) => m.kind === 'station' && inParts(m.p) && !rings.some((r) => !own.has(r) && area(r) > mainArea && inside(m.p, r)))
  const facilities = marks.filter((m) => m.kind === 'facility' && inParts(m.p))
  const names = [...stations.map((m) => (m.name.endsWith('駅') ? m.name : `${m.name}駅`)), ...facilities.map((m) => m.name)].filter((n, i, a) => n && n !== '駅駅' && a.indexOf(n) === i)
  return { kind: stations.length ? 'station' : 'facility', name: names.length ? names.join('・') : null }
}
