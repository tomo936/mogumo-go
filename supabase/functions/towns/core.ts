// towns の純粋な部分（Deno・npm を import しない）。テストは vitest で core.ts だけを読む。
// 境目のファイル作り（scripts/towns/build.ts）もここの格子の決まりを使う。
export const GRID_DEG = 0.25 // 境目のファイルの格子（度）
export const TILE_Z = 14 // お店を数えるタイルのズーム（アプリ・checkin と同じ）
export const TILES_PER_CALL = 40 // 1回の呼び出しで読むタイルの上限
export const TILE_BATCH = 10 // 並べて読む数。1束ごとに途中の結果を保存する
export const SHOPS_PER_CALL = 20 // 1回の呼び出しで町を決める店の上限
export const CHUNKS_PER_CALL = 3 // 1回の呼び出しで読む格子のファイルの上限
export const RECOUNT_DAYS = 30 // 町のお店の一覧を数え直すまでの日数
export const MATCH_M = 40 // 同じ店とみなす最大距離。checkin/core.ts の MATCH_M と同じにしておくこと（keep in sync）
export const TOWN_COINS = 100 // 町のクリアのコイン（SQL の grant_town と同じ）

const EARTH_RADIUS_M = 6371008.8 // src/map/domain/geo.ts と同じ
const rad = (deg: number) => (deg * Math.PI) / 180

type LatLng = { lat: number; lng: number }
type Ring = number[][] // [lng, lat] の並び
export type Geometry = { type: 'Polygon'; coordinates: number[][][] } | { type: 'MultiPolygon'; coordinates: number[][][][] }
export type Bbox = [number, number, number, number] // minLng, minLat, maxLng, maxLat
export type ChunkTown = { id: string; name: string; city: string; area: number; bbox: Bbox; geom: Geometry }
export type Chunk = { v: 1; towns: ChunkTown[] }
export type TownShop = { id: string; name: string; lat: number; lng: number } // 一覧の id は 'osm:<番号>'
export type CountState = { tiles: [number, number][]; next: number; shops: TownShop[] }
export type PoiFeature = { id?: number | string; name?: string; subclass?: string; lng: number; lat: number }

// 形の部品（Polygon）の並び。部品 = [外側の輪, 穴, 穴, …]
const parts = (g: Geometry): Ring[][] => (g.type === 'Polygon' ? [g.coordinates] : g.coordinates)

function ringBbox(ring: Ring): Bbox {
  let minLng = Infinity
  let minLat = Infinity
  let maxLng = -Infinity
  let maxLat = -Infinity
  for (const [lng, lat] of ring) {
    if (lng < minLng) minLng = lng
    if (lng > maxLng) maxLng = lng
    if (lat < minLat) minLat = lat
    if (lat > maxLat) maxLat = lat
  }
  return [minLng, minLat, maxLng, maxLat]
}

export function bboxOf(g: Geometry): Bbox {
  const out: Bbox = [Infinity, Infinity, -Infinity, -Infinity]
  for (const p of parts(g)) {
    const b = ringBbox(p[0] ?? [])
    out[0] = Math.min(out[0], b[0])
    out[1] = Math.min(out[1], b[1])
    out[2] = Math.max(out[2], b[2])
    out[3] = Math.max(out[3], b[3])
  }
  return out
}

// 位置が入る格子の名前（ファイルは g/<名前>.json.gz）
export function chunkKey(lat: number, lng: number): string {
  return `${Math.floor(lng / GRID_DEG)}_${Math.floor(lat / GRID_DEG)}`
}

// 形が触れる格子。部品ごとの外側の四角で決める（離れた島のあいだの格子を入れないため）
export function chunkKeysForGeometry(g: Geometry): string[] {
  const keys = new Set<string>()
  for (const p of parts(g)) {
    if (!p[0] || p[0].length === 0) continue
    const [minLng, minLat, maxLng, maxLat] = ringBbox(p[0])
    for (let gx = Math.floor(minLng / GRID_DEG); gx <= Math.floor(maxLng / GRID_DEG); gx++) {
      for (let gy = Math.floor(minLat / GRID_DEG); gy <= Math.floor(maxLat / GRID_DEG); gy++) keys.add(`${gx}_${gy}`)
    }
  }
  return [...keys]
}

// 点から東へのばした線が輪の辺を横切るたびに inside を返す（偶奇の決まり）
function crossings(ring: Ring, lat: number, lng: number): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]
    const [xj, yj] = ring[j]
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

// 部品の中か（外側の輪の中で、どの穴の中でもない = 全部の輪で偶奇を数える）
function inPart(part: Ring[], lat: number, lng: number): boolean {
  let inside = false
  for (const ring of part) if (crossings(ring, lat, lng)) inside = !inside
  return inside
}

export function inGeometry(g: Geometry, lat: number, lng: number): boolean {
  for (const p of parts(g)) if (inPart(p, lat, lng)) return true
  return false
}

// 位置を含む町。重なっていれば area の小さい方。無ければ null
export function findTown(towns: readonly ChunkTown[], lat: number, lng: number): ChunkTown | null {
  let best: ChunkTown | null = null
  for (const t of towns) {
    if (lng < t.bbox[0] || lat < t.bbox[1] || lng > t.bbox[2] || lat > t.bbox[3]) continue
    if (best && best.area <= t.area) continue
    if (inGeometry(t.geom, lat, lng)) best = t
  }
  return best
}

export function tileXY(lat: number, lng: number, z: number): { x: number; y: number } {
  const n = 2 ** z
  const x = Math.floor(((lng + 180) / 360) * n)
  const latR = rad(lat)
  const y = Math.floor(((1 - Math.log(Math.tan(latR) + 1 / Math.cos(latR)) / Math.PI) / 2) * n)
  return { x, y }
}

// タイル (x,y) の西端の経度・北端の緯度
const tileLng = (x: number, z: number) => (x / 2 ** z) * 360 - 180
const tileLat = (y: number, z: number) => (Math.atan(Math.sinh(Math.PI - (2 * Math.PI * y) / 2 ** z)) * 180) / Math.PI

// タイルの四角（西・南・東・北）
export function tileBounds(x: number, y: number, z: number): Bbox {
  return [tileLng(x, z), tileLat(y + 1, z), tileLng(x + 1, z), tileLat(y, z)]
}

// 2つの線分が交わるか
function segmentsCross(ax: number, ay: number, bx: number, by: number, cx: number, cy: number, dx: number, dy: number): boolean {
  const o = (px: number, py: number, qx: number, qy: number, rx: number, ry: number) => Math.sign((qx - px) * (ry - py) - (qy - py) * (rx - px))
  return o(ax, ay, bx, by, cx, cy) !== o(ax, ay, bx, by, dx, dy) && o(cx, cy, dx, dy, ax, ay) !== o(cx, cy, dx, dy, bx, by)
}

// 線分が四角に触れるか（端が中にある、または四角の辺を横切る）
function segmentTouchesBox(ax: number, ay: number, bx: number, by: number, [w, s, e, n]: Bbox): boolean {
  const inBox = (x: number, y: number) => x >= w && x <= e && y >= s && y <= n
  if (inBox(ax, ay) || inBox(bx, by)) return true
  return (
    segmentsCross(ax, ay, bx, by, w, s, e, s) ||
    segmentsCross(ax, ay, bx, by, e, s, e, n) ||
    segmentsCross(ax, ay, bx, by, e, n, w, n) ||
    segmentsCross(ax, ay, bx, by, w, n, w, s)
  )
}

// 形に触れるタイル（x、y の順に並べる）。部品ごとに、
// 1) 輪郭の辺が通るタイル  2) 外側の四角の中のタイルで、中心が形の中にあるもの
export function tilesForGeometry(g: Geometry, z: number): [number, number][] {
  const found = new Map<string, [number, number]>()
  const add = (x: number, y: number) => found.set(`${x}:${y}`, [x, y])
  for (const part of parts(g)) {
    if (!part[0] || part[0].length === 0) continue
    for (const ring of part) {
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [ax, ay] = ring[j]
        const [bx, by] = ring[i]
        const a = tileXY(ay, ax, z)
        const b = tileXY(by, bx, z)
        if (a.x === b.x && a.y === b.y) {
          add(a.x, a.y)
          continue
        }
        for (let x = Math.min(a.x, b.x); x <= Math.max(a.x, b.x); x++) {
          for (let y = Math.min(a.y, b.y); y <= Math.max(a.y, b.y); y++) {
            if (!found.has(`${x}:${y}`) && segmentTouchesBox(ax, ay, bx, by, tileBounds(x, y, z))) add(x, y)
          }
        }
      }
    }
    const [minLng, minLat, maxLng, maxLat] = ringBbox(part[0])
    const nw = tileXY(maxLat, minLng, z)
    const se = tileXY(minLat, maxLng, z)
    for (let x = nw.x; x <= se.x; x++) {
      for (let y = nw.y; y <= se.y; y++) {
        if (found.has(`${x}:${y}`)) continue
        const [w, s, e, n] = tileBounds(x, y, z)
        if (inPart(part, (s + n) / 2, (w + e) / 2)) add(x, y)
      }
    }
  }
  return [...found.values()].sort((p, q) => p[0] - q[0] || p[1] - q[1])
}

// 飲食店の種類。checkin/core.ts の FOOD と同じにしておくこと（keep in sync）
const FOOD = new Set(['restaurant', 'cafe', 'fast_food', 'bar', 'pub', 'bakery', 'confectionery', 'ice_cream'])

// 名前のある飲食店の点か（タイルを読む側が、位置を取り出す前のふるいにも使う）
export function isNamedFood(name: unknown, subclass: unknown): boolean {
  return typeof subclass === 'string' && FOOD.has(subclass) && typeof name === 'string' && name.trim() !== ''
}

// タイルの点のうち、名前のある飲食店で、形の中にあるもの
export function foodInTown(features: readonly PoiFeature[], g: Geometry): TownShop[] {
  const out: TownShop[] = []
  const [minLng, minLat, maxLng, maxLat] = bboxOf(g)
  for (const f of features) {
    if (f.id === undefined || !isNamedFood(f.name, f.subclass) || typeof f.name !== 'string') continue
    if (f.lng < minLng || f.lng > maxLng || f.lat < minLat || f.lat > maxLat) continue
    if (!inGeometry(g, f.lat, f.lng)) continue
    out.push({ id: `osm:${f.id}`, name: f.name, lat: f.lat, lng: f.lng })
  }
  return out
}

// id で重複なし（先に出たものを残す）
export function mergeShops(a: readonly TownShop[], b: readonly TownShop[]): TownShop[] {
  const seen = new Set<string>()
  const out: TownShop[] = []
  for (const s of [...a, ...b]) {
    if (seen.has(s.id)) continue
    seen.add(s.id)
    out.push(s)
  }
  return out
}

// ハバーサイン。checkin/core.ts の distanceM と同じ式
export function distanceM(a: LatLng, b: LatLng): number {
  const dLat = rad(b.lat - a.lat)
  const dLng = rad(b.lng - a.lng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)))
}

// 店名のならし方。src/shops/domain/merge.ts の normalizeName と同じにしておくこと（keep in sync: src/shops/domain/merge.ts）
export function normalizeName(name: string): string {
  return name
    .normalize('NFKC')
    .toLowerCase()
    .replace(/\([^)]*\)|「[^」]*」|\[[^\]]*\]/g, '')
    .replace(/[\s・\-‐－]/g, '')
    .replace(/[ぁ-ゖ]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0x60))
    .replace(/(本店|支店|店)$/, '')
}

// ならした名前が互いを含めば同じ店とみなす（merge.ts の namesContain と同じ。keep in sync）
export function namesMatch(a: string, b: string): boolean {
  const x = normalizeName(a)
  const y = normalizeName(b)
  return x !== '' && y !== '' && (x.includes(y) || y.includes(x))
}

const sameShop = (a: TownShop, b: TownShop) => a.id === b.id || (distanceM(a, b) <= MATCH_M && namesMatch(a.name, b.name))

// 町の進み具合。list = 町の一覧（地図のお店）、visited = その人がその町で行った店。
// 一覧の店は何度当たっても 1。一覧に無い店は 行った数・全部の数 の両方に足す（同じ店を hp: と osm: で行っても 1）
export function progress(list: readonly TownShop[], visited: readonly TownShop[]): { visited: number; total: number } {
  const hit = new Set<number>()
  const extra: TownShop[] = []
  for (const v of visited) {
    let i = list.findIndex((l) => l.id === v.id)
    if (i < 0) i = list.findIndex((l) => sameShop(l, v))
    if (i >= 0) hit.add(i)
    else if (!extra.some((e) => sameShop(e, v))) extra.push(v)
  }
  return { visited: hit.size + extra.length, total: list.length + extra.length }
}

// クリア: 半分（切り上げ）以上。コンプリート: 全部。お店が無い町はどちらでもない
export function judge(p: { visited: number; total: number }): { clear: boolean; complete: boolean } {
  if (p.total < 1) return { clear: false, complete: false }
  return { clear: p.visited >= Math.ceil(p.total / 2), complete: p.visited >= p.total }
}

// 町のお店を数える（数え直す）必要があるか
export function needsCount(countedAt: string | null, now: Date): boolean {
  if (countedAt === null) return true
  const t = Date.parse(countedAt)
  return !Number.isFinite(t) || now.getTime() - t > RECOUNT_DAYS * 24 * 3600 * 1000
}

// ---- 返事の組み立て（index.ts が使う） ----
export type TownRow = { town_id: string; name: string; city_name: string | null; shops: TownShop[] | null }
export type UserShop = TownShop & { lastAt: string } // その人がその町で行った店と、最後に行った時刻
export type Conquest = { conquered_at: string; completed_at: string | null }
export type TownView = {
  id: string; name: string; city: string | null; visited: number; total: number
  cleared_at: string | null; completed_at: string | null; counting: boolean; last_at: string | null
}

// 1つの町の進み具合と、今付けるべきもの。一覧がまだ無い町（数えている途中）は判定しない
export function townView(town: TownRow, mine: readonly UserShop[], have: Conquest | undefined): { view: TownView; clear: boolean; complete: boolean } {
  let last: string | null = null
  for (const s of mine) if (last === null || s.lastAt > last) last = s.lastAt
  const counting = town.shops === null
  const p = counting ? { visited: new Set(mine.map((s) => s.id)).size, total: 0 } : progress(town.shops ?? [], mine)
  const j = counting ? { clear: false, complete: false } : judge(p)
  return {
    view: {
      id: town.town_id, name: town.name, city: town.city_name, visited: p.visited, total: p.total,
      cleared_at: have?.conquered_at ?? null, completed_at: have?.completed_at ?? null, counting, last_at: last,
    },
    clear: j.clear && !have,
    complete: j.complete && !have?.completed_at,
  }
}

// 格子の一覧（g/index.json）。置いてある格子の名前。これが読めないうちは、店を「町なし」と決めない
export function parseIndex(v: unknown): Set<string> | null {
  if (typeof v !== 'object' || v === null) return null
  const keys = (v as { keys?: unknown }).keys
  if (!Array.isArray(keys) || keys.length === 0 || !keys.every((k) => typeof k === 'string')) return null
  return new Set(keys as string[])
}

export function isChunk(v: unknown): v is Chunk {
  return typeof v === 'object' && v !== null && (v as { v?: unknown }).v === 1 && Array.isArray((v as { towns?: unknown }).towns)
}
