import type { P } from '../../map/domain/geo.ts'
import { BUILDING_SAME_M } from '../config.ts'

// 輪郭に合わせて置いたときの中心（m、みな同じ原点）。輪郭の外は null
export type Groupable = { id: string; footprintCenter: P | null }

// 同じ建物（輪郭に合わせた中心がそろう）の店を1組にする。組の並びは最初に出た店の順。輪郭の外の店は1軒の組。
// 店は、組の中心（最初の店の中心）から sameM 未満の組のうち、いちばん先にできた組に入る。
// 組の中心を sameM 四方のマスに入れ、自分のマスとまわり 8 マスの組だけと比べる（前は全部の組と比べていて、
// 新宿のようにお店が多いと、お店の数の 2 乗の計算で動かすたびに止まった。2026-11-24）
export function groupShops(items: readonly Groupable[], sameM = BUILDING_SAME_M): string[][] {
  const groups: { center: P | null; ids: string[] }[] = []
  const grid = new Map<number, number[]>() // マス → そこに中心がある組の番号（できた順）。マスの見分けは数字（文字列は作るのが重い）
  const cellOf = (x: number, y: number) => x * 1_048_576 + y // 原点のまわり ±50 万マスまで重ならない
  for (const { id, footprintCenter: c } of items) {
    if (!c) {
      groups.push({ center: null, ids: [id] })
      continue
    }
    const gx = Math.floor(c.x / sameM)
    const gy = Math.floor(c.y / sameM)
    let best = -1
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (const gi of grid.get(cellOf(gx + dx, gy + dy)) ?? []) {
          if (best >= 0 && gi >= best) break // 番号は小さい順に入っているので、それより後は見なくてよい
          const g = groups[gi].center!
          if (Math.hypot(g.x - c.x, g.y - c.y) < sameM) best = gi
        }
      }
    }
    if (best >= 0) groups[best].ids.push(id)
    else {
      const k = cellOf(gx, gy)
      const cell = grid.get(k)
      if (cell) cell.push(groups.length)
      else grid.set(k, [groups.length])
      groups.push({ center: c, ids: [id] })
    }
  }
  return groups.map((g) => g.ids)
}
