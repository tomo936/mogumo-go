// 行ったお店を町ごとにまとめる（2026-11-24 記録の「町ごと」。外のレビューの案「行った日｜エリア別」）。
// お店の位置が町の形に入るかで決める。どの町にも入らない（位置が無い・形が読めていない）お店は「そのほか」
import { inTown, type Bbox, type Geometry } from '../../towns/domain/shape.ts'

export type TownShape = { id: string; name: string; geom: Geometry; bbox: Bbox }
export type TownGroup<V> = { id: string | null; name: string; items: V[] }

export function groupByTown<V extends { lat: number | null; lng: number | null }>(visits: readonly V[], towns: readonly TownShape[]): TownGroup<V>[] {
  const groups = new Map<string | null, TownGroup<V>>()
  for (const v of visits) {
    const t = v.lat !== null && v.lng !== null ? towns.find((x) => inTown(x, { lat: v.lat!, lng: v.lng! })) : undefined
    const id = t?.id ?? null
    if (!groups.has(id)) groups.set(id, { id, name: t?.name ?? 'そのほか', items: [] })
    groups.get(id)!.items.push(v)
  }
  // 行った回数の多い町から。「そのほか」はいちばん下
  return [...groups.values()].sort((a, b) => (a.id === null ? 1 : b.id === null ? -1 : b.items.length - a.items.length))
}
