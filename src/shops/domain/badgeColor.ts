import type { ShopKind } from './shop.ts'

// バッジの色（パステル19色。mystery は「その他」）
export const BADGE_COLOR: Record<ShopKind, string> = {
  ramen: '#ffd6a5', sushi: '#ffadad', soba: '#d4c5a9', washoku: '#caffbf', izakaya: '#ffc6ff',
  chinese: '#ffb3a7', yakiniku: '#f4a6a6', western: '#fdffb6', curry: '#ffe08a', cafe: '#d7c0ae',
  cake: '#ffd1e8', bakery: '#f5deb3', mystery: '#bdb2ff',
  // 枠の色に合わせた5種（枠 art/pins/frames の輪の色をパステルに寄せた）
  donburi: '#e8b4a0', burger: '#f0a8a0', ethnic: '#a8d5b5', okonomiyaki: '#d2b48c', takoyaki: '#f0b89a',
}
