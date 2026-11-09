// プレイヤーのレベル（2026-11-10 オーナー決定: 行ったお店の数で上がる）。
// レベル n に必要な訪問数 = 3 × n × (n−1) ÷ 2（Lv1: 0、Lv2: 3、Lv3: 9、Lv4: 18、Lv5: 30…）

export const needFor = (level: number): number => (3 * level * (level - 1)) / 2

export function levelFor(visited: number): { level: number; toNext: number } {
  let level = 1
  while (needFor(level + 1) <= visited) level++
  return { level, toNext: needFor(level + 1) - visited }
}
