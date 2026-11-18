import type { P } from '../../map/domain/geo.ts'
import { BUILDING_SAME_M } from '../config.ts'

// 輪郭に合わせて置いたときの中心（m、みな同じ原点）。輪郭の外は null
export type Groupable = { id: string; footprintCenter: P | null }

// 同じ建物（輪郭に合わせた中心がそろう）の店を1組にする。組の並びは最初に出た店の順。輪郭の外の店は1軒の組
export function groupShops(items: readonly Groupable[], sameM = BUILDING_SAME_M): string[][] {
  const groups: { center: P | null; ids: string[] }[] = []
  for (const { id, footprintCenter: c } of items) {
    const hit = c && groups.find((g) => g.center && Math.hypot(g.center.x - c.x, g.center.y - c.y) < sameM)
    if (hit) hit.ids.push(id)
    else groups.push({ center: c, ids: [id] })
  }
  return groups.map((g) => g.ids)
}
