import type { ShopKind } from './shop.ts'

// 1軒の店の symbol ピンを持ち上げる高さ。模型の高さ = 大きさ（sizeM、幅の長い方）× 種類ごとの「高さ/幅」の比。
// 比は src/assets/shops/*.glb の外形（高さ ÷ 横幅 x と z の長い方）から求めた（2026-11-09。新しい5種も同じ日に模型を作って測った）
export const HEIGHT_RATIO: Record<ShopKind, number> = {
  mystery: 0.6,
  burger: 0.65,
  ethnic: 0.7,
  chinese: 0.71,
  soba: 0.72,
  izakaya: 0.73,
  cafe: 0.75,
  donburi: 0.76,
  okonomiyaki: 0.79,
  bakery: 0.85,
  western: 0.94,
  cake: 0.97,
  washoku: 0.98,
  yakiniku: 1.05,
  takoyaki: 1.1,
  sushi: 1.14,
  curry: 1.25,
  ramen: 1.37,
}

export const LIFT_MARGIN_M = 1 // 屋根の少し上

// その店のピンを浮かせる高さ（m）= 模型の高さ + 少し
export function liftM(kind: ShopKind, sizeM: number, marginM = LIFT_MARGIN_M): number {
  return sizeM * (HEIGHT_RATIO[kind] ?? 1) + marginM
}

// 高さの段（スタイルの式は配列を動的に作れないので、段ごとの値を用意して match で選ぶ）。
// below: この高さ（m）未満ならその段。repM: 段の代表の高さ（m）。ピンの持ち上げに使う
export const LIFT_TIERS = {
  low: { below: 11, repM: 9 },
  mid: { below: 16, repM: 13.5 },
  high: { below: Infinity, repM: 19 },
} as const
export type LiftTier = keyof typeof LIFT_TIERS

export function liftTier(m: number): LiftTier {
  return m < LIFT_TIERS.low.below ? 'low' : m < LIFT_TIERS.mid.below ? 'mid' : 'high'
}
