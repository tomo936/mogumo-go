// 種類の食べ物の絵（ピンの枠なし。ミシェーラのアイコンを 96px にしたもの。作り方 art/prototypes/kind-icons.mjs）。
// 地図の外の画面（図鑑のタブ・札、お店のシートの小さい枠、ビルの一覧）で使う。地図の上はピン（pinIcons.ts）
import type { ShopKind } from '../domain/shop.ts'

const kinds = import.meta.glob('../../assets/kinds/*.webp', { eager: true, query: '?url', import: 'default' }) as Record<string, string>
export const kindIcon = (kind: ShopKind) => kinds[`../../assets/kinds/${kind}.webp`] ?? kinds['../../assets/kinds/mystery.webp']
