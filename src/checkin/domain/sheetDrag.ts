// お店のシートを指で引いて離したとき、どの段に収めるか（設計 2026-11-09 shop-sheet）。
// 下へ引いても閉じない（2026-11-09 オーナー: 小さい段で下にスライドできるのはまずい）。閉じるのは × だけ
export type SheetStop = 'small' | 'full' | 'close' // close は × のとき

export const SWIPE_PX = 40 // これだけ上下に動かしたら段を変える

export function sheetStop(from: 'small' | 'full', dy: number): SheetStop {
  if (dy < -SWIPE_PX) return 'full'
  if (dy > SWIPE_PX) return 'small'
  return from
}

// 引いている間のシートの高さ（指についてくる）。小さい段より下へは行かない。上は画面の高さまで
export function dragHeight(startH: number, dy: number, smallH: number, fullH: number): number {
  return Math.min(fullH, Math.max(smallH, startH - dy))
}
