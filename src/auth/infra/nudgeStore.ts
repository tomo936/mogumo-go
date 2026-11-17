// ゲストに前に勧めた節目（端末ごと・人ごと。localStorage `mogumo.linkNudge.<userId>`）。読めなければ 0
const key = (userId: string) => `mogumo.linkNudge.${userId}`

export function lastNudge(userId: string): number {
  try {
    const n = Number(localStorage.getItem(key(userId)) ?? '0')
    return Number.isFinite(n) && n > 0 ? n : 0
  } catch {
    return 0
  }
}

export function saveNudge(userId: string, milestone: number): void {
  try {
    localStorage.setItem(key(userId), String(milestone))
  } catch {
    // 書けなければ次も勧めるだけ
  }
}

// Google をつなごうとして、その Google がほかのアカウントで使われていた（戻り先の URL に付く）。
// 見つけたら URL から消して true
export function takeLinkConflict(): boolean {
  if (typeof window === 'undefined') return false
  const { search, hash, pathname } = window.location
  const params = [new URLSearchParams(search), new URLSearchParams(hash.replace(/^#/, ''))]
  const found = params.some((p) => p.get('error_code') === 'identity_already_exists')
  if (found) window.history.replaceState(null, '', pathname)
  return found
}
