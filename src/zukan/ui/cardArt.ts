// 図鑑・感想の画面で使う、種類の絵と星の文字
import type { ShopKind } from '../../shops/domain/shop.ts'

const cards = import.meta.glob('../../assets/shops/cards/*.webp', { eager: true, query: '?url', import: 'default' }) as Record<string, string>
export const cardUrl = (kind: ShopKind) => cards[`../../assets/shops/cards/${kind}.webp`] ?? cards['../../assets/shops/cards/mystery.webp']

// 種類の食べ物の絵（ピンの枠なし。図鑑のタブ・札。作り方 art/prototypes/kind-icons.mjs）
const kinds = import.meta.glob('../../assets/kinds/*.webp', { eager: true, query: '?url', import: 'default' }) as Record<string, string>
export const kindIcon = (kind: ShopKind) => kinds[`../../assets/kinds/${kind}.webp`] ?? kinds['../../assets/kinds/mystery.webp']

export const starText = (n: number) => '★★★★★'.slice(0, n) + '☆☆☆☆☆'.slice(0, 5 - n)
