import { distanceMeters } from '../../map/domain/geo.ts'
import { MATCH_DISTANCE_M } from '../config.ts'
import type { Shop } from './shop.ts'

// 店名をならす: NFKC → 小文字 → 括弧と中身を除く → 空白・・・-を除く → ひらがな→カタカナ → 末尾の店を除く
export function normalizeName(name: string): string {
  return name
    .normalize('NFKC')
    .toLowerCase()
    .replace(/\([^)]*\)|「[^」]*」|\[[^\]]*\]/g, '')
    .replace(/[\s・\-‐－]/g, '')
    .replace(/[ぁ-ゖ]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0x60))
    .replace(/(本店|支店|店)$/, '')
}

function namesContain(x: string, y: string): boolean {
  return x !== '' && y !== '' && (x.includes(y) || y.includes(x))
}

// 地図のお店にホットペッパーのお店を重ねる。合体したら詳細は hp、位置は地図のもの。
// 並びは「地図のお店の順（合体・未合体とも）→ 余ったホットペッパーのお店」。
export function mergeShops(mapShops: Shop[], hpShops: Shop[]): Shop[] {
  // 名前のならしは1店ごとに1回だけ（組み合わせごとにはしない）
  const hpNames = hpShops.map((h) => normalizeName(h.name))
  const taken = new Set<number>()
  const out: Shop[] = mapShops.map((m) => {
    const mName = normalizeName(m.name)
    if (mName === '') return m
    let best = -1
    let bestD = Infinity
    for (let i = 0; i < hpShops.length; i++) {
      if (taken.has(i)) continue
      const d = distanceMeters(m, hpShops[i])
      if (d > MATCH_DISTANCE_M || d >= bestD) continue // 安い判定を先に
      if (namesContain(mName, hpNames[i])) {
        best = i
        bestD = d
      }
    }
    if (best < 0) return m
    taken.add(best)
    return { ...hpShops[best], lat: m.lat, lng: m.lng }
  })
  hpShops.forEach((h, i) => {
    if (!taken.has(i)) out.push(h)
  })
  return out
}
