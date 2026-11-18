// 足元のチェックインの範囲に、足元から外へ広がる波紋（A2、2026-11-12 オーナー「案1・動かない外縁はいらない」）
export type Ripple = { radiusM: number; widthPx: number; opacity: number }

// nowMs の時の波 count 本。1 本ずつ periodMs/count ずつずらす。外へ行くほど細く・うすく、出はじめはふわっと出す
export function ripplesAt(nowMs: number, radiusM: number, periodMs: number, count: number): Ripple[] {
  const out: Ripple[] = []
  for (let i = 0; i < count; i++) {
    const p = (((nowMs / periodMs + i / count) % 1) + 1) % 1
    const eased = 1 - (1 - p) ** 2
    out.push({
      radiusM: radiusM * eased,
      widthPx: 2 + 3 * (1 - p),
      opacity: 0.9 * (1 - p) * Math.min(1, p * 6),
    })
  }
  return out
}
