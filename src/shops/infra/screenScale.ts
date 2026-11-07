// 地図の上の1点で、地面の 1m と高さの 1m が画面で何 px になるか。
// 東と北へ 10m 先を画面に写し、回転・傾きで縮んだ分を2本の向きから戻す（傾いた地面は「横はそのまま・奥行きだけ cos(傾き) 倍」とみなす）
import { localFrame } from '../../map/domain/geo.ts'

type Pt = { x: number; y: number }
type Project = (p: { lat: number; lng: number }) => Pt

export function screenScale(project: Project, at: { lat: number; lng: number }): { pxPerM: number; pxPerUpM: number } {
  const f = localFrame(at)
  const o = project(at)
  const e = project(f.back({ x: 10, y: 0 }))
  const n = project(f.back({ x: 0, y: 10 }))
  const ex = (e.x - o.x) / 10
  const ey = (e.y - o.y) / 10
  const nx = (n.x - o.x) / 10
  const ny = (n.y - o.y) / 10
  const a = ex * ex + ey * ey + nx * nx + ny * ny // = k²(1 + c²)
  const b = Math.abs(ex * ny - ey * nx) // = k² c
  const k2 = (a + Math.sqrt(Math.max(0, a * a - 4 * b * b))) / 2
  const k = Math.sqrt(k2)
  const c = k2 ? Math.min(1, b / k2) : 1
  return { pxPerM: k, pxPerUpM: k * Math.sqrt(1 - c * c) }
}
