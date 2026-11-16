// 引いた地図でピンをまとめる決まり（純粋な計算）。2026-11-13 オーナー: 寄ったら全部、引いたらまとめる（案A: その他のピン＋丸い数字の札）。
import { LIFT_MARGIN_M, liftM, liftTier } from './pinLift.ts'
import type { LiftTier } from './pinLift.ts'
import type { ShopKind } from './shop.ts'

// 気配のお店（正体を伏せている）と霧の中の近いお店は数に入れない（気配は「？」のピンで単独に出す）。

// 段は 2 つ（2026-11-16 オーナー承認 docs/superpowers/specs/2026-11-16-map-pins-by-zoom-design.md）:
// 寄り（17 以上）は全部のピン・ビルの並べたピン・施設の「6/6」。引き（16〜17）はお店をぜんぶまとめ、施設は名前の札だけ
export const CLUSTER_UNTIL_ZOOM = 17
export const CLUSTER_RADIUS_PX = 140 // 画面でこの近さまでのピンをまとめる（かなり離れていない限りまとめる。2026-11-13 オーナー「3以上はかなり離れてない限りまとめよう」）。2 軒以下はまとめない（CLUSTER_MIN_POINTS）
export const CLUSTER_MIN_POINTS = 2 // 近くのピンは 2 軒からまとめる（最初の仕様。3 軒以上にしたら大きなまとめの横にピンが残って見づらかった＝2026-11-16 オーナー）

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
  // liftTier・lt: ピンを持ち上げる高さの段（lt は 0 低・1 中・2 高。まとめはいちばん高い段）
  properties: { id: string; kind: string; n: number; done: number; ids: string; liftTier: LiftTier; lt: number }
}

const TIER_NO: Record<LiftTier, number> = { low: 0, mid: 1, high: 2 }
const DEFAULT_SIZE_M = 16 // 大きさが分からない店の目安（pinFeatures と同じ）

// まとめる層に渡す点: 1 軒の店と、ビル・施設の中のお店（どれも 1 軒ずつの点。その店の場所と種類）
export function clusterFeatures(
  singles: readonly (Point & { model: string; sizeM?: number })[],
  buildings: readonly { id: string; topM: number; shops: readonly { id: string; kind: string; lat: number; lng: number }[] }[],
  inFog: ReadonlySet<string>,
  hinted: ReadonlySet<string>,
  done: ReadonlySet<string>,
): ClusterFeature[] {
  const out: ClusterFeature[] = []
  const add = (id: string, kind: string, lat: number, lng: number, heightM: number) => {
    if (hinted.has(id)) return
    const tier = liftTier(Math.round(heightM * 10) / 10)
    out.push({ type: 'Feature', geometry: { type: 'Point', coordinates: [lng, lat] }, properties: { id, kind, n: 1, done: done.has(id) ? 1 : 0, ids: id, liftTier: tier, lt: TIER_NO[tier] } })
  }
  for (const s of singles) {
    if (inFog.has(s.id)) continue
    const id = s.shopIds.find((x) => !hinted.has(x))
    if (id) add(id, s.model, s.lat, s.lng, liftM(s.model as ShopKind, s.sizeM ?? DEFAULT_SIZE_M))
  }
  for (const b of buildings) {
    if (inFog.has(b.id)) continue
    for (const sh of b.shops) add(sh.id, sh.kind, sh.lat, sh.lng, b.topM + LIFT_MARGIN_M)
  }
  return out
}
