// お店の種類の日本語名（図鑑・実績で共通）
import type { ShopKind } from './shop.ts'

export const KIND_LABEL: Record<ShopKind, string> = {
  ramen: 'ラーメン', sushi: '寿司', soba: 'そば', washoku: '和食', izakaya: '居酒屋', chinese: '中華', yakiniku: '焼肉',
  western: '洋食', curry: 'カレー', cafe: 'カフェ', cake: 'スイーツ', bakery: 'パン', donburi: '丼もの', burger: 'ハンバーガー',
  ethnic: 'エスニック', okonomiyaki: 'お好み焼き', takoyaki: 'たこ焼き', mystery: 'その他',
}
