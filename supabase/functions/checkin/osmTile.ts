// 地図タイル（OpenFreeMap）から、アプリが言う番号の飲食店の点を確かめる（Deno 専用）。
// checkin/osmTile.ts と daily-hints/osmTile.ts は同じ中身にすること（keep in sync。テストで確かめる）。
// ダッシュボードのエディターでは同じフォルダのファイルしか置けないため、関数ごとに同じものを置いている。
import { VectorTile } from 'npm:@mapbox/vector-tile@2'
import Pbf from 'npm:pbf@4'
import { findPoi, tilesToTry } from './core.ts'
import type { PoiFeature } from './core.ts'

const Z = 14
const EDGE_M = 60
const TILEJSON = 'https://tiles.openfreemap.org/planet'

export class UpstreamError extends Error {}

async function fetchTilePois(x: number, y: number, template: string): Promise<PoiFeature[]> {
  const url = template.replace('{z}', String(Z)).replace('{x}', String(x)).replace('{y}', String(y))
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
    const g = f.toGeoJSON(x, y, Z).geometry
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

// 指定の位置のタイル（端に近ければ隣も）から、アプリが言う番号の点を探す
export async function verifyOsm(shopId: string, lat: number, lng: number): Promise<{ name: string; subclass: string; lng: number; lat: number } | null> {
  let template: unknown
  try {
    const meta = await fetch(TILEJSON, { signal: AbortSignal.timeout(15000) })
    if (!meta.ok) throw new UpstreamError('tilejson')
    template = (await meta.json())?.tiles?.[0]
  } catch {
    throw new UpstreamError('tilejson')
  }
  if (typeof template !== 'string') throw new UpstreamError('tilejson')
  for (const t of tilesToTry(lat, lng, Z, EDGE_M)) {
    const poi = findPoi(await fetchTilePois(t.x, t.y, template), shopId)
    if (poi) return poi
  }
  return null
}
