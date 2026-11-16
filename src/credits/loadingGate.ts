// 起動時のスプラッシュを、地図のお店がそろうまで出しておくための合図（2026-11-16 オーナー「お店を全部取ってから画面を出す」「その間タイトルでローディング」）。
// 地図の画面が start（読み始め）と done（そろった）を知らせる。地図の画面が無い（ログイン前など）ときは start されないので待たない
type State = 'idle' | 'waiting' | 'done'
let state: State = 'idle'
const subs = new Set<() => void>()
const set = (next: State) => {
  state = next
  for (const cb of subs) cb()
}

export const loading = {
  start: () => { if (state === 'idle') set('waiting') },
  done: () => set('done'),
  waiting: () => state === 'waiting',
  subscribe: (cb: () => void) => {
    subs.add(cb)
    return () => { subs.delete(cb) }
  },
  reset: () => set('idle'), // テスト用
}
