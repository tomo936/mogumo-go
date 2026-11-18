// 遠くの店を軽い模型に差し替える（LOD）ときの決まり。調整値は呼ぶ側（config.ts）から渡す

// 詳しい模型にする店の id。自分の位置（d）かカメラの真ん中（dCam）の近い方が nearM 以内の店を、近い順に max 軒まで。
// 前回詳しかった店は marginM だけ近いものとして扱う（境目を行き来してもチラつかないように）。
// must（タップして選んだ店）は距離によらず先に入れる（max の中に数える）
export function pickDetailed(
  items: { id: string; d: number; dCam?: number; must?: boolean }[],
  prev: ReadonlySet<string>, nearM: number, marginM: number, max: number,
): Set<string> {
  return new Set(
    items
      .map(({ id, d, dCam, must }) => {
        const near = Math.min(d, dCam ?? Infinity)
        return { id, must: !!must, e: prev.has(id) ? near - marginM : near }
      })
      .filter(({ e, must }) => must || e <= nearM)
      .sort((a, b) => Number(b.must) - Number(a.must) || a.e - b.e)
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
