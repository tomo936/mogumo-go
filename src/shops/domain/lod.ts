// 遠くの店を軽い模型に差し替える（LOD）ときの決まり。調整値は呼ぶ側（config.ts）から渡す

// 詳しい模型にする店の id。近い店（nearM 以内）を、近い順に max 軒まで。
// 前回詳しかった店は marginM だけ近いものとして扱う（境目を行き来してもチラつかないように）
export function pickDetailed(items: { id: string; d: number }[], prev: ReadonlySet<string>, nearM: number, marginM: number, max: number): Set<string> {
  return new Set(
    items
      .map(({ id, d }) => ({ id, e: prev.has(id) ? d - marginM : d }))
      .filter(({ e }) => e <= nearM)
      .sort((a, b) => a.e - b.e)
      .slice(0, max)
      .map(({ id }) => id),
  )
}

// 模型の数の上限: 施設は数えず全部残し、それ以外は近い順に max まで残す（並びは元のまま）
export function capModels<T extends { facility: boolean; d: number }>(items: T[], max: number): T[] {
  const others = items.filter((x) => !x.facility)
  if (others.length <= max) return items
  const keep = new Set([...others].sort((a, b) => a.d - b.d).slice(0, max))
  return items.filter((x) => x.facility || keep.has(x))
}
