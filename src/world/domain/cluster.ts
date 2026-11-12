// 画面の上で近い町の印をまとめる。純粋な計算。
export type TownMark = { id: string; name: string; cleared: boolean; lat: number; lng: number }
export type Group = { x: number; y: number; members: TownMark[] }

// 入力の順で先に来た点を核に、半径 radiusPx 以内の点を貪欲に集める。group の x,y は member の平均
export function clusterMarks(points: { mark: TownMark; x: number; y: number }[], radiusPx: number): Group[] {
  const used = new Array<boolean>(points.length).fill(false)
  const groups: Group[] = []
  for (let i = 0; i < points.length; i++) {
    if (used[i]) continue
    used[i] = true
    const picked = [points[i]]
    for (let j = i + 1; j < points.length; j++) {
      if (used[j]) continue
      if (Math.hypot(points[j].x - points[i].x, points[j].y - points[i].y) <= radiusPx) {
        used[j] = true
        picked.push(points[j])
      }
    }
    groups.push({
      x: picked.reduce((s, p) => s + p.x, 0) / picked.length,
      y: picked.reduce((s, p) => s + p.y, 0) / picked.length,
      members: picked.map((p) => p.mark),
    })
  }
  return groups
}
