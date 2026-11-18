// ポコタンの案内（A5）の決まり。設計 docs/superpowers/specs/2026-11-17-pokotan-guide-design.md
// ページの一覧・字の出し方・タップで何が起きるか・抜く丸の大きさ。画面は ui/Guide.tsx。

// どこを明るく抜くか: none = 抜かない、hint = 上の「？」の雲、menu = 下の丸いボタン、player = 左上のキャラとコイン
// （霧・チェックインのページは、指せる部品が無いので抜かない。2026-11-17 オーナー「指す円はいらないのでは」）
export type GuideTarget = 'none' | 'hint' | 'menu' | 'player'
export type GuidePage = { text: string; target: GuideTarget }

export const GUIDE_PAGES: GuidePage[] = [
  { text: 'ナビゲーターのポコタンポコ！ この町のおいしいお店、いっしょに探しに行くポコ！', target: 'none' },
  { text: 'まわりのもこもこは霧ポコ。霧の中のお店は、すぐ近くまで行かないと見えないポコ！', target: 'none' },
  { text: 'お店に着いたら、建物をタップしてチェックインするポコ！ 50m 以内ならできるポコ！', target: 'none' },
  { text: 'チェックインすると、まわりの霧がパーッと晴れるポコ！ 晴れた場所のお店は、ぜんぶ見えるようになるポコ！', target: 'none' },
  { text: '目指すのは町のクリアポコ！ 町のお店の半分に行くと、町じゅうの霧がいっぺんに晴れるポコ！', target: 'none' },
  { text: '上の「？」の雲を押すと、霧の中にかくれたお店の気配がわかるポコ。探しに行ってみるポコ〜！', target: 'hint' },
  { text: '下の丸いボタンからは、図鑑や記録が見られるポコ。行ったお店がどんどんたまっていくポコ！', target: 'menu' },
  { text: 'たまったグルメコインでガチャを引くと、新しいキャラが仲間になるポコ！ 左上から、お気に入りのキャラに変えられるポコ〜！', target: 'player' },
  { text: '準備ばっちりポコ！ まずはこの町のクリアを目指して、出発ポコ！', target: 'none' },
]

export const CHAR_MS = 40 // 1 字を出す間（一定。口の動きに合わせて変えない。2026-11-17 オーナー）
const PAUSE = /[、。！？!?〜\s]/

export function shownChars(text: string, elapsedMs: number): number {
  return Math.min(text.length, Math.floor(elapsedMs / CHAR_MS))
}

// 口の開き（0〜1）。字が出ている間だけ、2 字ごとに開け閉めする。区切りの字・出きったあとは閉じる
export function mouthAt(text: string, shown: number): number {
  if (shown <= 0 || shown >= text.length) return 0
  if (PAUSE.test(text[shown - 1])) return 0
  return Math.floor(shown / 2) % 2 === 0 ? 1 : 0.15
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

// いくつかの部品をまとめて囲む四角
export function unionRect(rs: Rect[]): Rect | null {
  if (rs.length === 0) return null
  const l = Math.min(...rs.map((r) => r.left))
  const t = Math.min(...rs.map((r) => r.top))
  const R = Math.max(...rs.map((r) => r.left + r.width))
  const B = Math.max(...rs.map((r) => r.top + r.height))
  return { left: l, top: t, width: R - l, height: B - t }
}

export function holeAround(r: Rect, pad: number): Hole {
  return { cx: r.left + r.width / 2, cy: r.top + r.height / 2, r: Math.max(r.width, r.height) / 2 + pad }
}
