// 起動時のスプラッシュを、地図のお店がそろうまで出しておくための合図（2026-11-16 オーナー「お店を全部取ってから画面を出す」「その間タイトルでローディング」）。
// 地図の画面が start（読み始め）と done（そろった）を知らせる。地図の画面が無い（ログイン前など）ときは start されないので待たない
type State = 'idle' | 'waiting' | 'done'
let state: State = 'idle'
// タイトルをもう閉じたか。新しいアカウントはログイン・初回設定のあとに地図の画面ができるので、閉じた合図を後から知る必要がある（2026-11-17 オーナー「新しいアカウントでポコタンが出ない」）
let entered = false
const subs = new Set<() => void>()
const enterSubs = new Set<() => void>() // タイトルを閉じて地図へ入った（空から降りる演出の合図）
// 行き先を決めている途中の画面（ログインの確認・初回設定の確認の「読み込み中…」）の数。
// その間に押されてもタイトルを消さない（消すと、地図の画面ができて待ちが始まるまでの一瞬、後ろが透けて見えた。2026-11-18 オーナー）
let holds = 0
const notify = () => {
  for (const cb of subs) cb()
}
const set = (next: State) => {
  state = next
  notify()
}

export const loading = {
  start: () => { if (state === 'idle') set('waiting') },
  done: () => set('done'),
  waiting: () => state === 'waiting' || holds > 0,
  // 出しているあいだタイトルを止める。返り値で外す（何度呼んでも 1 回だけ外す）
  hold: () => {
    holds++
    notify()
    let held = true
    return () => {
      if (!held) return
      held = false
      holds--
      notify()
    }
  },
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
    holds = 0
    set('idle')
  }, // テスト用
}
