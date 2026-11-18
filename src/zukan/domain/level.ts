// プレイヤーのレベルと経験値（2026-11-11 オーナー決定）。
// 経験値: 新しいお店 +10、同じお店にもう一度（1 日 1 回まで）+2。コイン・町・ミッションでは増えない。
// レベル n に必要な経験値 = 10 × 3 × n × (n−1) ÷ 2（Lv1: 0、Lv2: 30、Lv3: 90、Lv4: 180、Lv5: 300…）。
// 保存はしない。チェックインの記録から毎回計算する。

export const EXP_NEW = 10
export const EXP_REVISIT = 2

export const needFor = (level: number): number => (30 * level * (level - 1)) / 2

// お店ごとの行った回数（1 日 1 回までなので、回数 = チェックインの行数）から経験値を出す
export const expFromCounts = (counts: Iterable<number>): number => {
  let exp = 0
  for (const c of counts) if (c >= 1) exp += EXP_NEW + EXP_REVISIT * (c - 1)
  return exp
}
// 同じ店のチェックインの行（shopId の並び）から
export function expFromShopIds(ids: Iterable<string>): number {
  const m = new Map<string, number>()
  for (const id of ids) m.set(id, (m.get(id) ?? 0) + 1)
  return expFromCounts(m.values())
}

export type Level = { level: number; into: number; span: number; toNext: number }
export function levelFor(exp: number): Level {
  let level = 1
  while (needFor(level + 1) <= exp) level++
  const span = needFor(level + 1) - needFor(level)
  return { level, into: exp - needFor(level), span, toNext: needFor(level + 1) - exp }
}
