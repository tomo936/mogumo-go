// ポコタンの案内（A5）の決まり。設計 docs/superpowers/specs/2026-11-17-pokotan-guide-design.md
// ページの一覧・字の出し方・タップで何が起きるか・抜く丸の大きさ。画面は ui/Guide.tsx。

// どこを明るく抜くか: none = 抜かない、me = 自分のまわり、hint = 上の「？」の雲、menu = 下の丸いボタン
export type GuideTarget = 'none' | 'me' | 'hint' | 'menu'
export type GuidePage = { text: string; target: GuideTarget }

export const GUIDE_PAGES: GuidePage[] = [
  { text: 'ナビゲーターのポコタンポコ！ この町のおいしいお店、いっしょに探しに行くポコ！', target: 'none' },
  { text: 'まわりのもこもこは霧だポコ。歩くと晴れて、隠れたお店が見えてくるポコ！', target: 'me' },
  { text: '建物をタップするとお店がわかるポコ。50m まで近づいたらチェックインできるポコ！', target: 'me' },
  { text: '上の「？」の雲には、今日の気配が入ってるポコ。気になるお店を探しに行くポコ〜！', target: 'hint' },
  { text: '下の丸からは、図鑑や記録が見られるポコ。行ったお店がどんどんたまるポコ！', target: 'menu' },
  { text: '準備ばっちりだポコ！ さあ、出発ポコ！', target: 'none' },
]

export const CHAR_MS = 40 // 1 字を出す間

export function shownChars(text: string, elapsedMs: number): number {
  return Math.min(text.length, Math.floor(elapsedMs / CHAR_MS))
}

export function onTap(page: number, done: boolean): 'reveal' | 'next' | 'close' {
  if (!done) return 'reveal'
  return page >= GUIDE_PAGES.length - 1 ? 'close' : 'next'
}

// 端末に「もう見た」を残す鍵（人ごと）
export function guideKey(userId: string): string {
  return `mogumo.tutorial.${userId}`
}

export type Rect = { left: number; top: number; width: number; height: number }
export type Hole = { cx: number; cy: number; r: number }

export function holeAround(r: Rect, pad: number): Hole {
  return { cx: r.left + r.width / 2, cy: r.top + r.height / 2, r: Math.max(r.width, r.height) / 2 + pad }
}
