// チェーン店の判定（設計 docs/superpowers/specs/2026-11-12-hints-no-chains-design.md）。
// keep in sync: supabase/functions/daily-hints/chain.ts（同じ中身。chain.test.ts で確かめる）
import { CHAIN_NAMES } from './chainNames.ts'
import { CHAIN_NAMES_EXTRA } from './chainNamesExtra.ts'

// NFKC にして英字を小文字にし、空白と記号（・ー以外）を除く
export function normalizeShopName(s: string): string {
  return s.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}\p{M}・ー]/gu, '')
}

const DEFAULT_LIST: readonly string[] = [...CHAIN_NAMES, ...CHAIN_NAMES_EXTRA.map(normalizeShopName)]

// 最後の語が「〇〇店」なら除いた名前（支店名を外す。例「らーめん大将 中野店」→「らーめん大将」）
export function baseName(name: string): string {
  const words = name.normalize('NFKC').trim().split(/\s+/)
  if (words.length >= 2 && words[words.length - 1].endsWith('店')) words.pop()
  return normalizeShopName(words.join(''))
}

// 一覧の名前が 4 文字以上なら、正規化した店名に含まれればチェーン（例「ラーメン山岡家 中野店」）。
// 3 文字以下（かつや・ガスト・松屋など）は個人店の名前に紛れやすいので、次のときだけ当たり:
// 名前がそれだけ／最初の語がそれ／それ＋「〇〇店」（例「かつや中野店」。「とんかつやまだ」「ガストロパブ」「松屋食堂」は外れ）。
// list の名前は正規化済みであること
export function isChainName(name: string, list: readonly string[] = DEFAULT_LIST): boolean {
  const n = normalizeShopName(name)
  if (n === '') return false
  const first = normalizeShopName(name.normalize('NFKC').trim().split(/\s+/)[0] ?? '')
  for (const c of list) {
    const len = [...c].length
    if (len < 2) continue
    if (len >= 4) {
      if (n.includes(c)) return true
    } else if (n === c || first === c || (n.startsWith(c) && n.endsWith('店') && [...n].length <= len + 8)) {
      return true
    }
  }
  return false
}

// 同じ名前（支店名を除いて正規化）が min 軒以上ある名前の集合（地域チェーン用）
export function chainLikeByCount(shops: readonly { name: string }[], min = 3): Set<string> {
  const counts = new Map<string, number>()
  for (const s of shops) {
    const n = baseName(s.name)
    if (n !== '') counts.set(n, (counts.get(n) ?? 0) + 1)
  }
  return new Set([...counts].filter(([, c]) => c >= min).map(([n]) => n))
}
