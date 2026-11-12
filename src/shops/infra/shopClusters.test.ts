import { describe, expect, it, vi } from 'vitest'
import type { ClusterFeature } from '../domain/cluster.ts'
import { BUILDING_CLUSTER_UNTIL_ZOOM, CLUSTER_MIN_POINTS, CLUSTER_UNTIL_ZOOM } from '../domain/cluster.ts'
import { createShopClusters } from './shopClusters.ts'

const feat = (id: string, bld: number): ClusterFeature => ({
  type: 'Feature', geometry: { type: 'Point', coordinates: [139, 35] },
  properties: { id, kind: 'ramen', n: bld ? 3 : 1, done: 0, ids: id, liftTier: 'mid', lt: 1, bld },
})

function fakeMap(zoom: number) {
  const handlers: Record<string, (() => void)[]> = {}
  const added: { id: string; before?: string }[] = []
  let source: { setData: ReturnType<typeof vi.fn> } | null = null
  let sourceSpec: Record<string, unknown> = {}
  const map = {
    zoom,
    getZoom: () => map.zoom,
    on: (ev: string, fn: () => void) => { (handlers[ev] ??= []).push(fn) },
    off: vi.fn(),
    addSource: (_id: string, spec: Record<string, unknown>) => { sourceSpec = spec; source = { setData: vi.fn() } },
    getSource: () => source,
    addLayer: (l: { id: string }, before?: string) => { added.push({ id: l.id, before }) },
    getLayer: () => ({}),
    setLayoutProperty: vi.fn(),
    hasImage: () => false,
    addImage: vi.fn(),
    removeLayer: vi.fn(),
    removeSource: vi.fn(),
    listImages: () => [],
    triggerRepaint: vi.fn(),
  }
  return { map, handlers, added, get source() { return source }, get spec() { return sourceSpec } }
}
const names = (setData: ReturnType<typeof vi.fn>) => {
  const last = setData.mock.calls.at(-1)?.[0] as { features: ClusterFeature[] } | undefined
  return (last?.features ?? []).map((f) => f.properties.id)
}

describe('shopClusters', () => {
  it('3 軒以上でまとめる設定で、層は渡された位置（雲より上）の手前に入る', () => {
    const f = fakeMap(16.1)
    const c = createShopClusters(f.map as never)
    c.attach('me-avatar-3d')
    expect(f.spec.clusterMinPoints).toBe(CLUSTER_MIN_POINTS)
    expect(f.spec.clusterMaxZoom).toBe(CLUSTER_UNTIL_ZOOM - 1) // 倍率 17 からはまとめない
    expect(f.added.map((l) => l.before)).toEqual(['me-avatar-3d', 'me-avatar-3d'])
  })

  it('複合施設は、いちばん引いたときだけまとめに入る（ズームをまたぐと入れ替わる）', () => {
    const f = fakeMap(16.1)
    const c = createShopClusters(f.map as never)
    c.attach()
    c.update([feat('shop', 0), feat('bld', 1)])
    expect(names(f.source!.setData)).toEqual(['shop', 'bld']) // 16.1: いちばん引いたところ
    f.map.zoom = BUILDING_CLUSTER_UNTIL_ZOOM + 0.5
    f.handlers.zoom.forEach((h) => h())
    expect(names(f.source!.setData)).toEqual(['shop']) // 寄ったら今までのビルのピンに任せる
    f.map.zoom = 16.1
    f.handlers.zoom.forEach((h) => h())
    expect(names(f.source!.setData)).toEqual(['shop', 'bld'])
  })

  it('最初から寄っていれば、複合施設は入らない', () => {
    const f = fakeMap(17)
    const c = createShopClusters(f.map as never)
    c.attach()
    c.update([feat('shop', 0), feat('bld', 1)])
    expect(names(f.source!.setData)).toEqual(['shop'])
  })
})
