// キャラの一覧（ガチャ 30 体＋最初の 2 人）。名前と★は art/gacha/chars/char-roster.md、
// 入っているか（inPool）は SQL 0014 の characters.in_pool と同じ（変えたら両方を直す）
export type Rarity = 3 | 4 | 5

export type CharacterInfo = {
  id: number
  name: string
  rarity: Rarity | null // 最初の 2 人は null
  inPool: boolean
}

const G: [number, string, Rarity][] = [
  [1, 'にじいろキリン', 5], [2, '月うさぎ', 5], [3, '虹ペガサス', 5], [4, '天使', 5],
  [5, 'いちごミルクねこ', 4], [6, 'プリンしば', 4], [7, 'わたあめアルパカ', 4], [8, 'パフェうさぎ', 4],
  [9, 'チーズねずみ', 4], [10, 'メロンパンかめ', 4], [11, 'シュークリームひよこ', 4], [12, 'たいやき金魚', 4],
  [13, 'ドーナツりす', 3], [14, 'クッキーくま', 3], [15, 'マカロンももんが', 3], [16, 'カップケーキひつじ', 3],
  [17, 'クレープはりねずみ', 3], [18, 'パンケーキコアラ', 3], [19, 'かき氷しろくま', 3], [20, 'クリームソーダペンギン', 3],
  [21, '抹茶かえる', 3], [22, 'あんみつたぬき', 3], [23, 'カステラ子ねこ', 3], [24, 'ゼリーくらげ', 3],
  [25, 'キャンディハムスター', 3], [26, 'みたらし団子うさぎ', 3], [27, 'コーヒーふくろう', 3], [28, 'みつばち', 3],
  [29, 'ポップコーンきつね', 3], [30, 'ゆずねこ', 3],
]
const IN_POOL = new Set([1, 5, 6, 14, 26])

export const STARTER_IDS = [101, 102] as const

export const CHARACTERS: CharacterInfo[] = [
  { id: 101, name: '男の子', rarity: null, inPool: false },
  { id: 102, name: '女の子', rarity: null, inPool: false },
  ...G.map(([id, name, rarity]) => ({ id, name, rarity, inPool: IN_POOL.has(id) })),
]

export const characterById = (id: number): CharacterInfo | undefined => CHARACTERS.find((c) => c.id === id)
