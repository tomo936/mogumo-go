// 地図タイル（OpenFreeMap）の poi を読む（Deno 専用）。読み方は checkin/osmTile.ts と同じ。
import { VectorTile } from 'npm:@mapbox/vector-tile@2'
import Pbf from 'npm:pbf@4'
import { TILE_Z } from './core.ts'
import type { PoiFeature, Tile } from './core.ts'

const TILEJSON = 'https://tiles.openfreemap.org/planet'

export class UpstreamError extends Error {}

async function tileTemplate(): Promise<string> {
  try {
    const meta = await fetch(TILEJSON, { signal: AbortSignal.timeout(15000) })
    if (!meta.ok) throw new UpstreamError('tilejson')
    const t = (await meta.json())?.tiles?.[0]
    if (typeof t !== 'string') throw new UpstreamError('tilejson')
    return t
  } catch {
    throw new UpstreamError('tilejson')
  }
}

async function readOne(t: Tile, template: string): Promise<PoiFeature[]> {
  const url = template.replace('{z}', String(TILE_Z)).replace('{x}', String(t.x)).replace('{y}', String(t.y))
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
    const g = f.toGeoJSON(t.x, t.y, TILE_Z).geometry
    if (g.type !== 'Point') continue
    const [lng, lat] = g.coordinates as number[]
    out.push({
      id: f.id,
      name: typeof f.properties.name === 'string' ? f.properties.name : undefined,
      subclass: typeof f.properties.subclass === 'string' ? f.properties.subclass : undefined,
      lng,
      lat,
    })
  }
  return out
}

// 指定のタイルの poi を全部（1 枚でも読めなければ UpstreamError）
export async function readTilePois(tiles: readonly Tile[]): Promise<PoiFeature[]> {
  const template = await tileTemplate()
  const all = await Promise.all(tiles.map((t) => readOne(t, template)))
  return all.flat()
}
