import type { ShopKind } from './shop.ts'

// シロのアイコンが届くまでの仮のバッジ・ピンの色（パステル13色）
export const BADGE_COLOR: Record<ShopKind, string> = {
  ramen: '#ffd6a5', sushi: '#ffadad', soba: '#d4c5a9', washoku: '#caffbf', izakaya: '#ffc6ff',
  chinese: '#ffb3a7', yakiniku: '#f4a6a6', western: '#fdffb6', curry: '#ffe08a', cafe: '#d7c0ae',
  cake: '#ffd1e8', bakery: '#f5deb3', mystery: '#bdb2ff',
}
