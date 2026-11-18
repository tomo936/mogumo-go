// 明かした気配の記録（端末ごと）。localStorage の mogumo.hintsRevealed.<userId> に { day, generation, ids }。
// 日付か世代が違えば捨てる。読み書きが失敗しても落とさない。
const key = (userId: string) => `mogumo.hintsRevealed.${userId}`

export function loadRevealed(userId: string, day: string, generation: number): Set<string> {
  try {
    const raw = localStorage.getItem(key(userId))
    if (!raw) return new Set()
    const v = JSON.parse(raw) as { day?: unknown; generation?: unknown; ids?: unknown }
    if (v.day !== day || v.generation !== generation || !Array.isArray(v.ids)) return new Set()
    return new Set(v.ids.filter((x): x is string => typeof x === 'string'))
  } catch {
    return new Set()
  }
}

export function saveRevealed(userId: string, v: { day: string; generation: number; ids: string[] }): void {
  try {
    localStorage.setItem(key(userId), JSON.stringify(v))
  } catch {
    // 保存できなくても、その場の表示は続けられる
  }
}
