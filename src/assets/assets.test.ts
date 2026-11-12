import { describe, expect, it } from 'vitest'

const shops = import.meta.glob('./shops/*.glb', { eager: true, query: '?url', import: 'default' })
const lods = import.meta.glob('./shops/lod/*.glb', { eager: true, query: '?url', import: 'default' })

const pins = import.meta.glob('./pins/*.png', { eager: true, query: '?url', import: 'default' })

const KINDS = [
  'ramen', 'sushi', 'soba', 'washoku', 'izakaya', 'chinese', 'yakiniku',
  'western', 'curry', 'cafe', 'cake', 'bakery', 'mystery',
]

describe('ピンの絵', () => {
  it('合成済みのピンが 19 枚＋まとめの台がそろっている（sweets は cake、「？」は mystery、フォークとナイフは other、まとめは cluster-base 256px）', () => {
    const names = Object.keys(pins).map((p) => p.replace('./pins/', '').replace('.png', ''))
    expect(names.sort()).toEqual([...KINDS, 'other', ...NEW_KINDS, 'cluster-base'].sort())
  })
})

const NEW_KINDS = ['donburi', 'burger', 'ethnic', 'okonomiyaki', 'takoyaki']

describe('3D 素材', () => {
  it('店の glb が 18 種＋ビルそろっている', () => {
    const names = Object.keys(shops).map((p) => p.replace('./shops/', '').replace('.glb', ''))
    expect(names.sort()).toEqual([...KINDS, ...NEW_KINDS, 'building'].sort())
  })

  it('遠く用の軽い glb（lod/）も 18 種＋ビルそろっている', () => {
    const names = Object.keys(lods).map((p) => p.replace('./shops/lod/', '').replace('.glb', ''))
    expect(names.sort()).toEqual([...KINDS, ...NEW_KINDS, 'building'].sort())
  })

  it('新しい5種（丼・バーガー・エスニック・お好み焼き・たこ焼き）の glb が詳しい版と軽い版の両方にある', () => {
    for (const k of NEW_KINDS) {
      expect(shops[`./shops/${k}.glb`]).toBeTruthy()
      expect(lods[`./shops/lod/${k}.glb`]).toBeTruthy()
    }
  })
})
