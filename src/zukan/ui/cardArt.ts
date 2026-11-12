// 図鑑・感想の画面で使う、種類の絵と星の文字
import type { ShopKind } from '../../shops/domain/shop.ts'

const cards = import.meta.glob('../../assets/shops/cards/*.webp', { eager: true, query: '?url', import: 'default' }) as Record<string, string>
export const cardUrl = (kind: ShopKind) => cards[`../../assets/shops/cards/${kind}.webp`] ?? cards['../../assets/shops/cards/mystery.webp']

export { kindIcon } from '../../shops/infra/kindIcons.ts'

export const starText = (n: number) => '★★★★★'.slice(0, n) + '☆☆☆☆☆'.slice(0, 5 - n)
