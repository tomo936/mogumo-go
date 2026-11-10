// 霧の雲の塊をどこに・どの大きさで置くか（§12）。描き方は infra/fogLayer.ts
import { CELL_M, CLUMP_EDGE_M, CLUMP_JITTER, CLUMP_MAX_M, CLUMP_MIN_M, CLUMP_STEP_M, FOG_HALF_M, REF_LAT_DEG } from '../config.ts'
import type { LatLng } from '../../map/domain/geo.ts'
import type { Cleared } from './clearing.ts'
import { M_PER_DEG_LAT, cellCenter, cellKey, cellOf } from './grid.ts'

// x=東・y=北（origin からの m）、w=半幅 m、seed=形を変える種
export type Clump = { x: number; y: number; w: number; seed: number }

// 塊の形は半幅の 0.8 倍くらいまで横に広がる（これで晴れたセルへの食い込みを抑える）
const SPREAD = 0.8
const ROW_M = CLUMP_STEP_M * 0.866 // 六角格子の行の間隔
// 格子の経度方向は、セルと同じく北緯35度の 1度あたりの m で刻む（現在地の緯度で変わらない）
const GRID_M_LNG = M_PER_DEG_LAT * Math.cos((REF_LAT_DEG * Math.PI) / 180)

// 格子番号から [0,1) を作る決まった値のハッシュ（作り直しても同じ場所に同じ塊）
function hash01(i: number, j: number, salt: number): number {
  let h = Math.imul(i, 374761393) ^ Math.imul(j, 668265263) ^ Math.imul(salt + 1, 2246822519)
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  h = Math.imul(h ^ (h >>> 16), 2654435761)
  h ^= h >>> 15
  return (h >>> 0) / 4294967296
}

// p から maxM 以内の、いちばん近い晴れたセルの中心までの距離。無ければ Infinity
function nearestCleared(cleared: Cleared, p: LatLng, mLng: number, maxM: number): number {
  if (cleared.size === 0) return Infinity
  const c = cellOf(p)
  const n = Math.ceil(maxM / CELL_M) + 1
  let best = maxM * maxM
  for (let dx = -n; dx <= n; dx++) {
    for (let dy = -n; dy <= n; dy++) {
      const cell = { x: c.x + dx, y: c.y + dy }
      if (!cleared.has(cellKey(cell))) continue
      const q = cellCenter(cell)
      const ex = (q.lng - p.lng) * mLng
      const ey = (q.lat - p.lat) * M_PER_DEG_LAT
      best = Math.min(best, ex * ex + ey * ey)
    }
  }
  return best < maxM * maxM ? Math.sqrt(best) : Infinity
}

// half: 塊を置く範囲の半幅（m）。ふだんは現在地から FOG_HALF_M、記録の地図の遠くは広く
export function fogClumps(origin: LatLng, cleared: Cleared, half: number = FOG_HALF_M): Clump[] {
  // 格子点の番号は緯度経度の絶対値から決めるので、作り直しても同じ場所に同じ塊が出る。
  // x・y（origin からの m）だけは origin の緯度の 1度あたりの m で測る
  const mLng = M_PER_DEG_LAT * Math.cos((origin.lat * Math.PI) / 180)
  const j0 = Math.floor((origin.lat * M_PER_DEG_LAT - half) / ROW_M)
  const j1 = Math.ceil((origin.lat * M_PER_DEG_LAT + half) / ROW_M)
  const i0 = Math.floor((origin.lng * GRID_M_LNG - half * (GRID_M_LNG / mLng)) / CLUMP_STEP_M) - 1
  const i1 = Math.ceil((origin.lng * GRID_M_LNG + half * (GRID_M_LNG / mLng)) / CLUMP_STEP_M) + 1
  const out: Clump[] = []
  for (let j = j0; j <= j1; j++) {
    const shift = (j & 1) * 0.5
    for (let i = i0; i <= i1; i++) {
      const lat = (j * ROW_M + (hash01(i, j, 2) - 0.5) * CLUMP_JITTER * CLUMP_STEP_M) / M_PER_DEG_LAT
      const lng = ((i + shift) * CLUMP_STEP_M + (hash01(i, j, 1) - 0.5) * CLUMP_JITTER * CLUMP_STEP_M) / GRID_M_LNG
      const x = (lng - origin.lng) * mLng
      const y = (lat - origin.lat) * M_PER_DEG_LAT
      if (Math.abs(x) > half || Math.abs(y) > half) continue
      const p = { lat, lng }
      if (cleared.has(cellKey(cellOf(p)))) continue
      let w = CLUMP_MIN_M + hash01(i, j, 3) * (CLUMP_MAX_M - CLUMP_MIN_M)
      // 晴れたセルに近いほど小さくする（縁がもこもこになる）
      const d = nearestCleared(cleared, p, mLng, CLUMP_EDGE_M + w * SPREAD)
      if (d !== Infinity) w = Math.min(w, (d - CLUMP_EDGE_M) / SPREAD)
      if (w < CLUMP_MIN_M * 0.45) continue
      out.push({ x, y, w, seed: hash01(i, j, 4) * 100 })
    }
  }
  return out
}

// 画面の奥にある塊から順に並べる。画面の上（奥）は、地図の向き bearing の方角
export function drawOrder<T extends Clump>(clumps: readonly T[], bearingDeg: number): T[] {
  const b = (bearingDeg * Math.PI) / 180
  const ux = Math.sin(b)
  const uy = Math.cos(b)
  return [...clumps].sort((a, c) => c.x * ux + c.y * uy - (a.x * ux + a.y * uy))
}
