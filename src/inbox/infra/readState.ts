// 読んだお知らせの番号（端末ごと。localStorage `mogumo.noticesRead.<userId>`）。
// 使えないとき（プライベートブラウズなど）は空として扱い、書けなくても止めない
const key = (userId: string) => `mogumo.noticesRead.${userId}`
const KEEP = 100 // 古い番号は捨てる（お知らせは最大 30 件しか出さない）

export function loadRead(userId: string): Set<number> {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(key(userId)) ?? '[]')
    return new Set(Array.isArray(v) ? v.filter((x): x is number => typeof x === 'number') : [])
  } catch {
    return new Set()
  }
}

export function markRead(userId: string, ids: readonly number[]): Set<number> {
  const all = [...new Set([...loadRead(userId), ...ids])].sort((a, b) => b - a).slice(0, KEEP)
  try {
    localStorage.setItem(key(userId), JSON.stringify(all))
  } catch {
    // 書けなくても続ける
  }
  return new Set(all)
}
