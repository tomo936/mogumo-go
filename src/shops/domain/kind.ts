import type { ShopKind } from './shop.ts'

// 言葉は文字列（含むかどうか）か正規表現（短い言葉の誤判定よけ）。店名は小文字にして比べる
type Word = string | RegExp
const has = (name: string, words: Word[]) => {
  const n = name.toLowerCase()
  return words.some((w) => (typeof w === 'string' ? n.includes(w) : w.test(n)))
}

// 麺の字を含んでも別の種類になる店（先に見る）
const SOBA_FIRST = ['丸亀']
const WESTERN_FIRST = ['洋麺屋', '五右衛門']
const CHINESE_FIRST = ['担々', '担担', '刀削', '四川', '麻辣']

const RAMEN: Word[] = ['ラーメン', 'らーめん', '拉麺', '中華そば', '麺', 'らぁ', 'らあ', 'ramen', '一蘭', '一風堂', '天下一品']
const SUSHI: Word[] = ['寿司', '鮨', 'すし', 'sushi', 'zushi', 'スシロー', '銚子丸', 'かっぱ', '魚がし', '回転']
const SOBA: Word[] = ['そば', '蕎麦', 'うどん', 'soba', 'udon', '丸亀', 'ゆで太郎', 'つるとんたん', '美々卯']
const CURRY: Word[] = ['カレー', 'curry', 'coco壱番屋', 'ココイチ', 'インド', 'ネパール', 'ターリー', 'マサラ', 'naan']
const CAKE: Word[] = ['ケーキ', 'スイーツ']
// 「パン」は パンダ・パンツ・ジャパン・パンケーキ などに当たらないようにする
const BAKERY: Word[] = [/(?<!ジャ)パン(?!ダ|ツ|ケーキ|フレット)/, 'ベーカリー', 'ブーランジェリー', 'bakery', 'boulangerie']
// 地図の店（ジャンルの情報が無い）を店名から推し量るための言葉
const GUESS: [ShopKind, Word[]][] = [
  ['yakiniku', ['焼肉', 'ホルモン', '焼き肉', 'yakiniku', '牛角', '叙々苑', '牛繁', '明月館', 'bbq', '牛たん', '牛タン', 'ジンギスカン']],
  ['chinese', ['中華', '餃子', 'ぎょうざ', '飯店', '担々', '麻婆', '小籠包', '酒家', '菜館', '日高屋', '王将', 'バーミヤン', '麻辣', '四川', 'din tai fung', 'haidilao', '海底撈', '重慶', '刀削']],
  ['western', [
    'イタリア', 'トラットリア', 'リストランテ', 'ピッツァ', 'ピザ', 'パスタ', 'ビストロ', '洋食', 'ハンバーグ', 'ステーキ', 'フレンチ', 'オムライス',
    'trattoria', 'pizza', 'bistro', 'italian',
    'ガスト', 'ジョナサン', 'デニーズ', 'ロイヤルホスト', 'サイゼリヤ', '五右衛門', 'スパゲティ', 'オステリア', 'ペッパーランチ', 'びっくりドンキー', 'ファミレス',
  ]],
  ['izakaya', [
    '居酒屋', '酒場', '焼鳥', '焼き鳥', 'やきとり', '串', '魚民', '和民', '鳥貴族', '大衆', '立ち飲み', '立呑',
    'もつ焼', '塚田農場', '磯丸水産', 'とり', '鳥', /バル(?![ーコト])/, /(?<!ナン)バー(?!ガ)/, /(^|[^a-z])bar($|[^a-z])/,
  ]],
  ['cake', ['ケーキ', 'スイーツ', 'パティスリー', 'ドーナツ', 'クレープ', 'ジェラート', 'アイス', 'patisserie', 'cake', 'donut']],
  ['cafe', ['カフェ', '珈琲', 'コーヒー', '喫茶', 'cafe', 'coffee', 'café']],
  ['washoku', [
    '定食', 'とんかつ', '天ぷら', '天麩羅', '割烹', '和食', '丼', '牛丼', '食堂', 'おにぎり', '鰻', 'うなぎ',
    'やよい軒', '大戸屋', '小料理', 'かっぽう', 'かつや', '松のや', '牛かつ', 'てんや', '宇奈とと', 'しゃぶしゃぶ', '温野菜', 'しゃぶ葉', 'すき焼き', 'おでん',
  ]],
  ['bakery', BAKERY],
]
const guess = (name: string): ShopKind | null => GUESS.find(([, words]) => has(name, words))?.[0] ?? null

// ラーメン（丸亀製麺・洋麺屋のような麺の字だけの店は除く）
const isRamen = (name: string) => has(name, RAMEN) && !has(name, SOBA_FIRST) && !has(name, WESTERN_FIRST) && !has(name, CHINESE_FIRST)

// 店名だけで決まる種類（ラーメン・寿司・そば・カレー）。地図の店はこれを分類より先に見る
const byName = (name: string): ShopKind | null => {
  if (has(name, WESTERN_FIRST)) return 'western'
  if (has(name, SOBA_FIRST)) return 'soba'
  if (has(name, CHINESE_FIRST)) return 'chinese'
  if (isRamen(name)) return 'ramen'
  if (has(name, SUSHI)) return 'sushi'
  if (has(name, SOBA)) return 'soba'
  if (has(name, CURRY)) return 'curry'
  return null
}

// ホットペッパーのジャンルコード → 種類（spec 4.5）
// 要確認: ジャンルマスタ（G001 居酒屋 / G002 ダイニングバー / G004 和食 / G005 洋食 / G006 イタリアン・フレンチ /
//   G007 中華 / G011 カラオケ・パーティ / G012 バー・カクテル / G008 焼肉・ホルモン / G013 ラーメン / G014 カフェ・スイーツ / G017 韓国料理）
export const kindFromHotpepper = (genreCode: string | null, name: string): ShopKind => {
  if (genreCode === 'G013' || isRamen(name)) return 'ramen'
  if (genreCode === 'G004' && has(name, SUSHI)) return 'sushi'
  if (genreCode === 'G004' && has(name, SOBA)) return 'soba'
  if (has(name, CURRY)) return 'curry'
  if (genreCode === 'G008' || genreCode === 'G017') return 'yakiniku'
  if (genreCode === 'G007') return 'chinese'
  if (genreCode === 'G005' || genreCode === 'G006') return 'western'
  if (genreCode === 'G004') return 'washoku'
  if (genreCode === 'G001' || genreCode === 'G002' || genreCode === 'G012' || genreCode === 'G011') return 'izakaya'
  if (genreCode === 'G014' && has(name, CAKE)) return 'cake'
  if (genreCode === 'G014') return 'cafe'
  if (has(name, BAKERY)) return 'bakery'
  return guess(name) ?? 'mystery'
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
      return guess(name) ?? 'mystery'
  }
}
