// 引いた地図でピンをまとめる決まり（純粋な計算）。2026-11-13 オーナー: 寄ったら全部、引いたらまとめる（案A: その他のピン＋丸い数字の札）。
// 気配のお店（正体を伏せている）と霧の中の近いお店は数に入れない（気配は「？」のピンで単独に出す）。

export const CLUSTER_UNTIL_ZOOM = 17.5 // これより引いたらまとめる。寄ったら今までどおり全部のピン
export const CLUSTER_RADIUS_PX = 72 // 画面でこの近さのピンをまとめる

// 札の数字。100 以上は「99+」
export const badgeText = (n: number): string => (n > 99 ? '99+' : String(n))

// 札の丸の直径に対する字の大きさ。丸のまま、桁が増えたら字を小さくして収める（楕円にしない）
export function badgeFontRatio(text: string): number {
  return text.length >= 3 ? 0.36 : text.length === 2 ? 0.5 : 0.62
}

// まとめた数でピンの大きさを 3 段に（2〜9・10〜29・30 以上）
export const clusterScale = (n: number): number => (n >= 30 ? 1.25 : n >= 10 ? 1.12 : 1)

type Point = { id: string; lat: number; lng: number; shopIds: readonly string[] }
export type ClusterFeature = {
  type: 'Feature'
  geometry: { type: 'Point'; coordinates: [number, number] }
  properties: { id: string; kind: string; n: number; done: number; ids: string }
}

// まとめる層に渡す点: 1 軒の店（n=1、絵は kind）とビル・施設（n=中のお店の数）
export function clusterFeatures(
  singles: readonly (Point & { model: string })[],
  buildings: readonly Point[],
  inFog: ReadonlySet<string>,
  hinted: ReadonlySet<string>,
  done: ReadonlySet<string>,
): ClusterFeature[] {
  const out: ClusterFeature[] = []
  const add = (p: Point, kind: string) => {
    if (inFog.has(p.id)) return
    const ids = p.shopIds.filter((id) => !hinted.has(id))
    if (ids.length === 0) return
    out.push({ type: 'Feature', geometry: { type: 'Point', coordinates: [p.lng, p.lat] }, properties: { id: p.id, kind, n: ids.length, done: ids.filter((id) => done.has(id)).length, ids: ids.join(',') } })
  }
  for (const s of singles) add(s, s.model)
  for (const b of buildings) add(b, 'mystery')
  return out
}
