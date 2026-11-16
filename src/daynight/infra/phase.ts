// 昼と夜（A14）。いまはどちらか。試作の段階では URL に ?night を付けたときだけ夜（あとで日の入り・日の出で決める）。
// 地図・雲・3D の層はここを見て色や光を変える。
// ?night を一度付けたら、ログインの行き来で URL から消えても、そのタブを閉じるまで夜。?day で戻す
function fromUrl(): boolean {
  if (typeof window === 'undefined') return false
  const q = new URLSearchParams(window.location.search)
  try {
    if (q.has('night')) sessionStorage.setItem('mogumo.night', '1')
    if (q.has('day')) sessionStorage.removeItem('mogumo.night')
    return sessionStorage.getItem('mogumo.night') === '1'
  } catch {
    return q.has('night')
  }
}
let night = fromUrl()
const subs = new Set<(night: boolean) => void>()

export function isNight(): boolean {
  return night
}

export function setNight(v: boolean) {
  if (v === night) return
  night = v
  subs.forEach((f) => f(v))
}

export function onPhase(f: (night: boolean) => void): () => void {
  subs.add(f)
  return () => void subs.delete(f)
}
