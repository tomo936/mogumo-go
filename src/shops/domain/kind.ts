import type { ShopKind } from './shop.ts'

const has = (name: string, words: string[]) => words.some((w) => name.includes(w))

const RAMEN = ['ラーメン', 'らーめん', '拉麺', '中華そば']
const SUSHI = ['寿司', '鮨', 'すし']
const SOBA = ['そば', '蕎麦', 'うどん']
const CURRY = ['カレー']
const CAKE = ['ケーキ', 'スイーツ']
const BAKERY = ['パン', 'ベーカリー', 'ブーランジェリー']

// 店名だけで決まる種類（ラーメン・寿司・そば・カレー）。地図の店はこれを分類より先に見る
const byName = (name: string): ShopKind | null => {
  if (has(name, RAMEN)) return 'ramen'
  if (has(name, SUSHI)) return 'sushi'
  if (has(name, SOBA)) return 'soba'
  if (has(name, CURRY)) return 'curry'
  return null
}

// ホットペッパーのジャンルコード → 種類（spec 4.5）
// 要確認: ジャンルマスタ（G001 居酒屋 / G002 ダイニングバー / G004 和食 / G005 洋食 / G006 イタリアン・フレンチ /
//   G007 中華 / G008 焼肉・ホルモン / G013 ラーメン / G014 カフェ・スイーツ / G017 韓国料理）
export const kindFromHotpepper = (genreCode: string | null, name: string): ShopKind => {
  if (genreCode === 'G013' || has(name, RAMEN)) return 'ramen'
  if (genreCode === 'G004' && has(name, SUSHI)) return 'sushi'
  if (genreCode === 'G004' && has(name, SOBA)) return 'soba'
  if (has(name, CURRY)) return 'curry'
  if (genreCode === 'G008' || genreCode === 'G017') return 'yakiniku'
  if (genreCode === 'G007') return 'chinese'
  if (genreCode === 'G005' || genreCode === 'G006') return 'western'
  if (genreCode === 'G004') return 'washoku'
  if (genreCode === 'G001' || genreCode === 'G002') return 'izakaya'
  if (genreCode === 'G014' && has(name, CAKE)) return 'cake'
  if (genreCode === 'G014') return 'cafe'
  if (has(name, BAKERY)) return 'bakery'
  return 'mystery'
}

// 地図タイルの POI の分類（subclass）→ 種類。店名の決まりを先に見る
export const kindFromMap = (subclass: string, name: string): ShopKind => {
  const n = byName(name)
  if (n) return n
  switch (subclass) {
    case 'bakery':
      return 'bakery'
    case 'confectionery':
    case 'ice_cream':
      return 'cake'
    case 'cafe':
      return 'cafe'
    case 'bar':
    case 'pub':
      return 'izakaya'
    default:
      return 'mystery'
  }
}
