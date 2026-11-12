// チェーン店の判定（設計 docs/superpowers/specs/2026-11-12-hints-no-chains-design.md）。
// keep in sync: supabase/functions/daily-hints/chain.ts（同じ中身。chain.test.ts で確かめる）
import { CHAIN_NAMES } from './chainNames.ts'
import { CHAIN_NAMES_EXTRA } from './chainNamesExtra.ts'

// NFKC にして英字を小文字にし、空白と記号（・ー以外）を除く
export function normalizeShopName(s: string): string {
  return s.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}\p{M}・ー]/gu, '')
}

const DEFAULT_LIST: readonly string[] = [...CHAIN_NAMES, ...CHAIN_NAMES_EXTRA.map(normalizeShopName)]

// 正規化した店名が一覧の名前を含めばチェーン。一覧の名前が 2 文字以下なら前方一致だけ。
// list の名前は正規化済みであること
export function isChainName(name: string, list: readonly string[] = DEFAULT_LIST): boolean {
  const n = normalizeShopName(name)
  if (n === '') return false
  for (const c of list) {
    if (c.length < 2) continue
    if (c.length <= 2 ? n.startsWith(c) : n.includes(c)) return true
  }
  return false
}

// 同じ正規化名が min 軒以上ある名前の集合（地域チェーン用）
export function chainLikeByCount(shops: readonly { name: string }[], min = 3): Set<string> {
  const counts = new Map<string, number>()
  for (const s of shops) {
    const n = normalizeShopName(s.name)
    if (n !== '') counts.set(n, (counts.get(n) ?? 0) + 1)
  }
  return new Set([...counts].filter(([, c]) => c >= min).map(([n]) => n))
}
