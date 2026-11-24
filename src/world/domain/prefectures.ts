// 行った県（2026-11-24 外のレビュー「行った地域を塗る・県境」）。町の番号の頭 2 桁が都道府県のコード（e-Stat の PREF）
export function visitedPrefCodes(townIds: readonly string[]): string[] {
  return [...new Set(townIds.map((id) => id.slice(0, 2)).filter((c) => /^\d{2}$/.test(c)))]
}
