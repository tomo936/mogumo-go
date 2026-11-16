// 昼と夜（A14）。日の入りから次の日の出までが夜（今いる場所で計算。場所が分かるまでは自宅か東京）。
// 起動時・アプリに戻ってきたとき・1 分ごとに確かめ、変わったら知らせる（地図の色・雲・3D・BGM が切り替わる）。
// 試すとき: ?night で夜・?day で昼に固定（そのタブを閉じるまで）。?auto で固定をやめる。
import { isNightAt } from '../domain/sun.ts'

const KEY = 'mogumo.phase' // 'night' | 'day'（試すときの固定）
const CHECK_MS = 60_000
const TOKYO = { lat: 35.68, lng: 139.77 }

function forced(): boolean | null {
  if (typeof window === 'undefined') return null
  const q = new URLSearchParams(window.location.search)
  try {
    if (q.has('night')) sessionStorage.setItem(KEY, 'night')
    if (q.has('day')) sessionStorage.setItem(KEY, 'day')
    if (q.has('auto')) sessionStorage.removeItem(KEY)
    const v = sessionStorage.getItem(KEY)
    return v === 'night' ? true : v === 'day' ? false : null
  } catch {
    return q.has('night') ? true : q.has('day') ? false : null
  }
}

const fixed = forced()
let where = TOKYO
let night = fixed ?? isNightAt(new Date(), where.lat, where.lng)
const subs = new Set<(night: boolean) => void>()

export function isNight(): boolean {
  return night
}

function update() {
  const v = fixed ?? isNightAt(new Date(), where.lat, where.lng)
  if (v === night) return
  night = v
  subs.forEach((f) => f(v))
}

// 場所が分かったら（自宅・現在地）。大きく動いたときだけ計算し直せば十分なので、毎回呼んでよい
export function setPlace(p: { lat: number; lng: number }) {
  where = { lat: p.lat, lng: p.lng }
  update()
}

export function onPhase(f: (night: boolean) => void): () => void {
  subs.add(f)
  return () => void subs.delete(f)
}

if (typeof window !== 'undefined' && fixed === null) {
  setInterval(update, CHECK_MS)
  document.addEventListener('visibilitychange', () => !document.hidden && update())
}
