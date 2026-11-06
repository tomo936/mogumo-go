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

function namesMatch(a: string, b: string): boolean {
  const x = normalizeName(a)
  const y = normalizeName(b)
  return x !== '' && y !== '' && (x.includes(y) || y.includes(x))
}

// 地図のお店にホットペッパーのお店を重ねる。合体したら詳細は hp、位置は地図のもの。
// 並びは「地図のお店の順（合体・未合体とも）→ 余ったホットペッパーのお店」。
export function mergeShops(mapShops: Shop[], hpShops: Shop[]): Shop[] {
  const taken = new Set<number>()
  const out: Shop[] = mapShops.map((m) => {
    let best = -1
    let bestD = Infinity
    hpShops.forEach((h, i) => {
      if (taken.has(i)) return
      const d = distanceMeters(m, h)
      if (d <= MATCH_DISTANCE_M && d < bestD && namesMatch(m.name, h.name)) {
        best = i
        bestD = d
      }
    })
    if (best < 0) return m
    taken.add(best)
    return { ...hpShops[best], lat: m.lat, lng: m.lng }
  })
  hpShops.forEach((h, i) => {
    if (!taken.has(i)) out.push(h)
  })
  return out
}
