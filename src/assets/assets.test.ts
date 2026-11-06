import { describe, expect, it } from 'vitest'

const shops = import.meta.glob('./shops/*.glb', { eager: true, query: '?url', import: 'default' })
const clouds = import.meta.glob('./fog/cloud*.glb', { eager: true, query: '?url', import: 'default' })

const KINDS = [
  'ramen', 'sushi', 'soba', 'washoku', 'izakaya', 'chinese', 'yakiniku',
  'western', 'curry', 'cafe', 'cake', 'bakery', 'mystery',
]

describe('3D 素材', () => {
  it('店の glb が 13 種そろっている', () => {
    const names = Object.keys(shops).map((p) => p.replace('./shops/', '').replace('.glb', ''))
    expect(names.sort()).toEqual([...KINDS].sort())
  })

  it('雲の glb が 3 個ある', () => {
    expect(Object.keys(clouds)).toHaveLength(3)
  })
})
