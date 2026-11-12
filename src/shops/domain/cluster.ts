// 引いた地図でピンをまとめる決まり（純粋な計算）。2026-11-13 オーナー: 寄ったら全部、引いたらまとめる（案A: その他のピン＋丸い数字の札）。
import { LIFT_MARGIN_M, liftM, liftTier } from './pinLift.ts'
import type { LiftTier } from './pinLift.ts'
import type { ShopKind } from './shop.ts'

// 気配のお店（正体を伏せている）と霧の中の近いお店は数に入れない（気配は「？」のピンで単独に出す）。

export const CLUSTER_UNTIL_ZOOM = 17.5 // これより引いたらまとめる。寄ったら今までどおり全部のピン
export const CLUSTER_RADIUS_PX = 40 // 画面でこの近さ（ほぼ重なるくらい）のピンだけをまとめる。離れていれば 1 軒ずつ（2026-11-13 オーナー）
export const CLUSTER_MIN_POINTS = 3 // 3 軒以上でまとめる。2 軒以下は 1 軒ずつのピン（「2」などは出さない）
// 複合施設（ビル・駅・大型施設）をまとめに入れるのは、いちばん引いたときだけ。それ以外は今までのビルのピン（「6/6」など）
export const BUILDING_CLUSTER_UNTIL_ZOOM = 16.3

// 札の数字。100 以上は「99+」
export const badgeText = (n: number): string => (n > 99 ? '99+' : String(n))

// 札の字の大きさは桁によらず同じ（2026-11-13 オーナー）。いちばん長い「99+」が丸の中に収まる大きさにそろえる
export const BADGE_WIDEST_TEXT = '99+'
export const BADGE_TEXT_FIT = 0.74 // 丸の直径に対して、いちばん長い字の幅をここまでにする

// まとめた数でピンの大きさを 3 段に（2〜9・10〜29・30 以上）
export const clusterScale = (n: number): number => (n >= 30 ? 1.25 : n >= 10 ? 1.12 : 1)

type Point = { id: string; lat: number; lng: number; shopIds: readonly string[] }
export type ClusterFeature = {
  type: 'Feature'
  geometry: { type: 'Point'; coordinates: [number, number] }
  // liftTier・lt: ピンを持ち上げる高さの段（lt は 0 低・1 中・2 高。まとめはいちばん高い段）／bld: ビル・施設か
  properties: { id: string; kind: string; n: number; done: number; ids: string; liftTier: LiftTier; lt: number; bld: number }
}

const TIER_NO: Record<LiftTier, number> = { low: 0, mid: 1, high: 2 }
const DEFAULT_SIZE_M = 16 // 大きさが分からない店の目安（pinFeatures と同じ）

// まとめる層に渡す点: 1 軒の店（n=1、絵は kind）とビル・施設（n=中のお店の数）
export function clusterFeatures(
  singles: readonly (Point & { model: string; sizeM?: number })[],
  buildings: readonly (Point & { topM: number })[],
  inFog: ReadonlySet<string>,
  hinted: ReadonlySet<string>,
  done: ReadonlySet<string>,
): ClusterFeature[] {
  const out: ClusterFeature[] = []
  const add = (p: Point, kind: string, heightM: number, bld: number) => {
    if (inFog.has(p.id)) return
    const ids = p.shopIds.filter((id) => !hinted.has(id))
    if (ids.length === 0) return
    const tier = liftTier(Math.round(heightM * 10) / 10)
    out.push({ type: 'Feature', geometry: { type: 'Point', coordinates: [p.lng, p.lat] }, properties: { id: p.id, kind, n: ids.length, done: ids.filter((id) => done.has(id)).length, ids: ids.join(','), liftTier: tier, lt: TIER_NO[tier], bld } })
  }
  for (const s of singles) add(s, s.model, liftM(s.model as ShopKind, s.sizeM ?? DEFAULT_SIZE_M), 0)
  for (const b of buildings) add(b, 'mystery', b.topM + LIFT_MARGIN_M, 1)
  return out
}
