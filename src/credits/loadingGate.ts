// 起動時のスプラッシュを、地図のお店がそろうまで出しておくための合図（2026-11-16 オーナー「お店を全部取ってから画面を出す」「その間タイトルでローディング」）。
// 地図の画面が start（読み始め）と done（そろった）を知らせる。地図の画面が無い（ログイン前など）ときは start されないので待たない
type State = 'idle' | 'waiting' | 'done'
let state: State = 'idle'
// タイトルをもう閉じたか。新しいアカウントはログイン・初回設定のあとに地図の画面ができるので、閉じた合図を後から知る必要がある（2026-11-17 オーナー「新しいアカウントでポコタンが出ない」）
let entered = false
const subs = new Set<() => void>()
const enterSubs = new Set<() => void>() // タイトルを閉じて地図へ入った（空から降りる演出の合図）
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
  enter: () => {
    entered = true
    for (const cb of enterSubs) cb()
  },
  hasEntered: () => entered,
  onEnter: (cb: () => void) => {
    enterSubs.add(cb)
    return () => { enterSubs.delete(cb) }
  },
  reset: () => {
    entered = false
    set('idle')
  }, // テスト用
}
