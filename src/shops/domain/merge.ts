import { distanceMeters } from '../../map/domain/geo.ts'
import { MATCH_DISTANCE_M } from '../config.ts'
import type { Shop } from './shop.ts'

const M_PER_DEG_LAT = 111195

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

// すぐ近く（FUZZY_MATCH_M 以内）なら、1〜2文字の打ち間違い（例: TOSOANA と TOSCANA）も同じ店とみなす。
// 店名を空白・括弧で語に分け、4文字以上の語どうしが 75% 以上似ていれば一致
const FUZZY_MATCH_M = 20
const FUZZY_RATIO = 0.75

export function nameTokens(name: string): string[] {
  return name
    .normalize('NFKC')
    .toLowerCase()
    .split(/[\s・\-‐－()「」[\]]+/)
    .map((t) => t.replace(/[ぁ-ゖ]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0x60)))
    .filter((t) => [...t].length >= 4)
}

function editDistance(a: string, b: string): number {
  const x = [...a]
  const y = [...b]
  let prev = Array.from({ length: y.length + 1 }, (_, j) => j)
  for (let i = 1; i <= x.length; i++) {
    const cur = [i]
    for (let j = 1; j <= y.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (x[i - 1] === y[j - 1] ? 0 : 1))
    }
    prev = cur
  }
  return prev[y.length]
}

export function tokensSimilar(xs: string[], ys: string[]): boolean {
  return xs.some((x) =>
    ys.some((y) => 1 - editDistance(x, y) / Math.max([...x].length, [...y].length) >= FUZZY_RATIO),
  )
}

// 地図のお店にホットペッパーのお店を重ねる。合体したら詳細は hp、位置は地図のもの。
// 並びは「地図のお店の順（合体・未合体とも）→ 余ったホットペッパーのお店」。
export function mergeShops(mapShops: Shop[], hpShops: Shop[]): Shop[] {
  // 名前のならしは1店ごとに1回だけ（組み合わせごとにはしない）
  const hpNames = hpShops.map((h) => normalizeName(h.name))
  const hpTokens = hpShops.map((h) => nameTokens(h.name))
  const taken = new Set<number>()
  const out: Shop[] = mapShops.map((m) => {
    const mName = normalizeName(m.name)
    if (mName === '') return m
    const mTokens = nameTokens(m.name)
    const cosLat = Math.cos((m.lat * Math.PI) / 180)
    let best = -1
    let bestD = Infinity
    for (let i = 0; i < hpShops.length; i++) {
      if (taken.has(i)) continue
      // 緯度・経度の差だけで遠い店は、ハバーサインを計算せずに飛ばす
      if (Math.abs(hpShops[i].lat - m.lat) * M_PER_DEG_LAT > MATCH_DISTANCE_M) continue
      if (Math.abs(hpShops[i].lng - m.lng) * M_PER_DEG_LAT * cosLat > MATCH_DISTANCE_M) continue
      const d = distanceMeters(m, hpShops[i])
      if (d > MATCH_DISTANCE_M || d >= bestD) continue // 安い判定を先に
      if (namesContain(mName, hpNames[i]) || (d <= FUZZY_MATCH_M && tokensSimilar(mTokens, hpTokens[i]))) {
        best = i
        bestD = d
      }
    }
    if (best < 0) return m
    taken.add(best)
    return { ...hpShops[best], lat: m.lat, lng: m.lng, mapId: m.id }
  })
  hpShops.forEach((h, i) => {
    if (!taken.has(i)) out.push(h)
  })
  return out
}
