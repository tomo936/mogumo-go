// 画面のテスト用の気配
import type { DailyHint, HintSet } from '../domain/hint.ts'

export const hint = (id: string, o: Partial<DailyHint> = {}): DailyHint => ({
  id, slot: 1, shopId: `hp:${id}`, genre: '中華', catch: '自家製麺の濃厚つけ麺', budget: '1,000円台', isMystery: false, completed: false,
  shop: { name: `秘密亭${id}`, lat: 35, lng: 139 }, ...o,
})
export const setOf = (hints: DailyHint[], o: Partial<HintSet> = {}): HintSet => ({ day: '2026-11-07', generation: 1, regenLeft: 1, hints, ...o })
