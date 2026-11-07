import { describe, expect, it } from 'vitest'

const shops = import.meta.glob('./shops/*.glb', { eager: true, query: '?url', import: 'default' })
const lods = import.meta.glob('./shops/lod/*.glb', { eager: true, query: '?url', import: 'default' })

const KINDS = [
  'ramen', 'sushi', 'soba', 'washoku', 'izakaya', 'chinese', 'yakiniku',
  'western', 'curry', 'cafe', 'cake', 'bakery', 'mystery',
]

describe('3D 素材', () => {
  it('店の glb が 13 種＋ビルそろっている', () => {
    const names = Object.keys(shops).map((p) => p.replace('./shops/', '').replace('.glb', ''))
    expect(names.sort()).toEqual([...KINDS, 'building'].sort())
  })

  it('遠く用の軽い glb（lod/）も 13 種＋ビルそろっている', () => {
    const names = Object.keys(lods).map((p) => p.replace('./shops/lod/', '').replace('.glb', ''))
    expect(names.sort()).toEqual([...KINDS, 'building'].sort())
  })
})
