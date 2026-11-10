// 地図タイル（OpenFreeMap）から、名前のある飲食店の点を読む（Deno 専用）。
// 読み方は checkin/osmTile.ts と同じ（同じ TileJSON・同じ poi 層・同じ時間切れ）。
// ちがいは、位置を取り出す前に「名前のある飲食店」だけにふるうこと（町を数えるときは1回に最大 40 枚読むため）。
import { VectorTile } from 'npm:@mapbox/vector-tile@2'
import Pbf from 'npm:pbf@4'
import { TILE_Z, isNamedFood } from './core.ts'
import type { PoiFeature } from './core.ts'

const TILEJSON = 'https://tiles.openfreemap.org/planet'

export class UpstreamError extends Error {}

// タイルの URL の型（{z}/{x}/{y} 入り）
export async function tileTemplate(): Promise<string> {
  let template: unknown
  try {
    const meta = await fetch(TILEJSON, { signal: AbortSignal.timeout(15000) })
    if (!meta.ok) throw new UpstreamError('tilejson')
    template = (await meta.json())?.tiles?.[0]
  } catch {
    throw new UpstreamError('tilejson')
  }
  if (typeof template !== 'string') throw new UpstreamError('tilejson')
  return template
}

// タイル (x, y) の、名前のある飲食店の点。タイルが無ければ空。読めなければ UpstreamError
export async function fetchTileFood(x: number, y: number, template: string): Promise<PoiFeature[]> {
  const url = template.replace('{z}', String(TILE_Z)).replace('{x}', String(x)).replace('{y}', String(y))
  let tile: VectorTile
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) })
    if (res.status === 404 || res.status === 204) return []
    if (!res.ok) throw new UpstreamError('tile')
    tile = new VectorTile(new Pbf(new Uint8Array(await res.arrayBuffer())))
  } catch {
    throw new UpstreamError('tile')
  }
  const layer = tile.layers['poi']
  if (!layer) return []
  const out: PoiFeature[] = []
  for (let i = 0; i < layer.length; i++) {
    const f = layer.feature(i)
    if (!isNamedFood(f.properties.name, f.properties.subclass)) continue
    const g = f.toGeoJSON(x, y, TILE_Z).geometry
    if (g.type !== 'Point') continue
    const [lng, lat] = g.coordinates as number[]
    out.push({ id: f.id, name: f.properties.name as string, subclass: f.properties.subclass as string, lng, lat })
  }
  return out
}
