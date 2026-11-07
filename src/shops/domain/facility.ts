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

// 入口の位置: 真ん中から正面の向き（北0・時計回り）へ進んで、輪郭を出た最初の所。
// 真ん中が輪郭の外（凹んだ形）でその向きに壁が無いときは、真ん中にいちばん近い壁の上
export function doorPoint(center: P, facingDeg: number, ring: P[]): P {
  const r = (facingDeg * Math.PI) / 180
  const dir = { x: Math.sin(r), y: Math.cos(r) }
  const at = (t: number) => ({ x: center.x + dir.x * t, y: center.y + dir.y * t })
  const ts: number[] = []
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[j]
    const e = { x: ring[i].x - a.x, y: ring[i].y - a.y }
    const den = dir.x * e.y - dir.y * e.x
    if (Math.abs(den) < 1e-9) continue
    const w = { x: a.x - center.x, y: a.y - center.y }
    const t = (w.x * e.y - w.y * e.x) / den
    const u = (w.x * dir.y - w.y * dir.x) / den
    if (t > 0 && u >= 0 && u <= 1) ts.push(t)
  }
  ts.sort((a, b) => a - b)
  const exit = ts.find((t) => inside(at(Math.max(0, t - 0.01)), ring) && !inside(at(t + 0.01), ring))
  if (exit !== undefined) return at(exit)
  let best = center
  let bestD = Infinity
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[j]
    const b = ring[i]
    const ex = b.x - a.x
    const ey = b.y - a.y
    const len2 = ex * ex + ey * ey
    const k = len2 ? Math.max(0, Math.min(1, ((center.x - a.x) * ex + (center.y - a.y) * ey) / len2)) : 0
    const q = { x: a.x + ex * k, y: a.y + ey * k }
    const d = Math.hypot(q.x - center.x, q.y - center.y)
    if (d < bestD) {
      bestD = d
      best = q
    }
  }
  return best
}

// 点の上の屋根の高さ: 点を含む部分のうちいちばん高いもの（どれにも入らなければ本体の高さ）
export function heightAt(parts: FacilityPart[], p: P): number {
  const hs = parts.filter((q) => inside(p, q.pts)).map((q) => q.heightM)
  return hs.length ? Math.max(...hs) : parts[0].heightM
}

// 2つの施設が同じ輪郭を描かないようにする。どれかの施設の本体（parts[0]）の輪郭はその施設のもの、
// それ以外の重なりの部分は先に出た施設のもの。key は輪郭を見分ける文字列
export function dropSharedParts<R, F extends { parts: { ring: R }[] }>(list: F[], key: (ring: R) => string): F[] {
  const mains = new Set(list.map((f) => key(f.parts[0].ring)))
  const used = new Set<string>()
  return list.map((f) => {
    const parts = f.parts.filter((q, i) => {
      const k = key(q.ring)
      if (i > 0 && (mains.has(k) || used.has(k))) return false
      used.add(k)
      return true
    })
    return parts.length === f.parts.length ? f : { ...f, parts }
  })
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
