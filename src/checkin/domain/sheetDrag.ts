// お店のシートを指で引いて離したとき、どの段に収めるか（設計 2026-11-09 shop-sheet）
export type SheetStop = 'small' | 'full' | 'close'

export const SWIPE_PX = 40 // これだけ上下に動かしたら段を変える

export function sheetStop(from: 'small' | 'full', dy: number, height: number, smallH: number): SheetStop {
  if (dy < -SWIPE_PX) return 'full'
  if (dy > SWIPE_PX) {
    if (from === 'small') return 'close'
    return height < smallH * 0.6 ? 'close' : 'small' // 全画面から一気に下まで引いたら閉じる
  }
  return from
}

// 引いている間のシートの高さ（指についてくる）。下は 0、上は画面の高さまで
export function dragHeight(startH: number, dy: number, fullH: number): number {
  return Math.min(fullH, Math.max(0, startH - dy))
}
