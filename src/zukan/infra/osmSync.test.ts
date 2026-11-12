import { beforeEach, describe, expect, it, vi } from 'vitest'
import { cellKey, cellOf } from '../../fog/domain/grid.ts'
import { syncOsmShops } from './osmSync.ts'
import type { Shop } from '../../shops/domain/shop.ts'

const a: Shop = { id: 'osm:1', name: 'たこ焼き', lat: 35.6812, lng: 139.7671, kind: 'takoyaki', details: null, mapId: null }
const cleared = new Set([cellKey(cellOf(a))])
const now = new Date('2026-11-12T03:00:00Z')
beforeEach(() => localStorage.clear())

describe('syncOsmShops', () => {
  it('送って、成功したら送った日を残す（2 回目は送らない）', async () => {
    const post = vi.fn(async () => true)
    await syncOsmShops('u1', [a], cleared, { post, now })
    expect(post).toHaveBeenCalledWith([{ x: 14552, y: 6451 }])
    await syncOsmShops('u1', [a], cleared, { post, now })
    expect(post).toHaveBeenCalledTimes(1)
  })
  it('失敗したら残さない（次にまた送る）', async () => {
    const post = vi.fn(async () => false)
    await syncOsmShops('u1', [a], cleared, { post, now })
    await syncOsmShops('u1', [a], cleared, { post, now })
    expect(post).toHaveBeenCalledTimes(2)
  })
  it('送る物が無ければ呼ばない', async () => {
    const post = vi.fn(async () => true)
    await syncOsmShops('u1', [a], new Set(), { post, now })
    expect(post).not.toHaveBeenCalled()
  })
})
