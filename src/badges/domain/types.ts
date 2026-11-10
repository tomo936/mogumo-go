// 実績（バッジ）の型。★の数とメダルの色は1対1（★1 クリーム … ★5 虹）。★は「むずかしさ」。
// 仕様: docs/superpowers/specs/2026-11-10-record-pins-badges-mypage-settings-design.md（確定の節）
import type { ShopKind } from '../../shops/domain/shop.ts'

export type Stars = 1 | 2 | 3 | 4 | 5
export type Tier = 'cream' | 'bronze' | 'silver' | 'gold' | 'rainbow'

const TIERS: Tier[] = ['cream', 'bronze', 'silver', 'gold', 'rainbow']
export const tierOf = (stars: Stars): Tier => TIERS[stars - 1]

export type BadgeGroup = 'genre' | 'explore' | 'regular' | 'fog' | 'far' | 'rhythm' | 'hashigo' | 'hint' | 'season' | 'quirky'

export const GROUP_ORDER: BadgeGroup[] = ['genre', 'explore', 'regular', 'fog', 'far', 'rhythm', 'hashigo', 'hint', 'season', 'quirky']
export const GROUP_LABEL: Record<BadgeGroup, string> = {
  genre: 'ジャンル', explore: '開拓', regular: '常連', fog: '霧はらい', far: '遠征', rhythm: '毎日・リズム',
  hashigo: 'はしご', hint: '気配', season: '季節・記念日', quirky: 'ちょっと変わった',
}

export type BadgeIcon =
  | 'walk' | 'store' | 'cloud' | 'flag' | 'compass' | 'calendar' | 'bowls' | 'hint'
  | 'sun' | 'moon' | 'clock' | 'heart' | 'gift' | 'leaf' | 'star'

export type BadgeVisit = {
  shopId: string
  kind: ShopKind
  at: number // ms
  lat: number | null
  lng: number | null
  wasHint: boolean
  mysteryHint: boolean
}

export type BadgeInput = {
  visits: BadgeVisit[]
  cellTimes: number[] // 晴れたマスの時刻（ms）
  home: { lat: number; lng: number } | null
}

// 計算用に、日本時間の日・時刻などを付けた訪問
export type PreparedVisit = BadgeVisit & { day: string; month: string; md: string; hour: number; minute: number; dow: number }
export type Prepared = { visits: PreparedVisit[]; cellTimes: number[]; home: BadgeInput['home'] }

// have = 今の数（表示の単位で）、at = 取れた時刻
export type Measure = { have: number | null; at: number | null }

export type BadgeDef = {
  id: string
  series: string // 段のつながり（同じ series は一覧で1つにまとめる。1つだけの実績は id と同じ）
  group: BadgeGroup
  name: string
  how: string // 条件の短い文
  stars: Stars
  secret: boolean // 取るまで「？？？」
  art: { kind: ShopKind } | { icon: BadgeIcon }
  need: number | null // 進み具合を出すときの目標（null は出さない）
  unit: string // 「あと N◯」の単位
  needsHome: boolean
  measure: (p: Prepared, need: number) => Measure
}

export type BadgeState = { def: BadgeDef; earnedAt: number | null; have: number | null }
