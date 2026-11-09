// daily-hints の純粋な部分（Deno・npm を import しない）。テストは vitest で core.ts だけを読む。
// 下の「写した部品」は checkin から写したもの（Edge Function はフォルダごとに置くため import できない）。
// keep in sync: supabase/functions/checkin/core.ts（同じ答えを返すことを core.test.ts で確かめる）

// ---- 写した部品（checkin/core.ts） ----
export const MATCH_M = 40 // 合体とみなす最大距離。src/shops/config.ts の MATCH_DISTANCE_M と同じにしておくこと（keep in sync）

const EARTH_RADIUS_M = 6371008.8 // src/map/domain/geo.ts と同じ
const M_PER_DEG_LAT = 111195 // src/fog/domain/grid.ts と同じ
const rad = (deg: number) => (deg * Math.PI) / 180

export type LatLng = { lat: number; lng: number }

// ハバーサイン。distanceMeters と同じ式
export function distanceM(a: LatLng, b: LatLng): number {
  const dLat = rad(b.lat - a.lat)
  const dLng = rad(b.lng - a.lng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)))
}

// 日の区切り（N-08 未決定のため JST 0時）。変えるならここだけ
export function jstDay(now: Date): string {
  return new Date(now.getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10)
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

// 位置を含むタイルを先頭に、端から edgeM 以内ならその側の隣のタイルも返す（角なら斜めも）
export function tilesToTry(lat: number, lng: number, z: number, edgeM: number): { x: number; y: number }[] {
  const t = tileXY(lat, lng, z)
  const mPerLng = M_PER_DEG_LAT * Math.cos(rad(lat))
  const west = (lng - tileLng(t.x, z)) * mPerLng
  const east = (tileLng(t.x + 1, z) - lng) * mPerLng
  const north = (tileLat(t.y, z) - lat) * M_PER_DEG_LAT
  const south = (lat - tileLat(t.y + 1, z)) * M_PER_DEG_LAT
  const dxs = [0]
  if (west <= edgeM) dxs.push(-1)
  if (east <= edgeM) dxs.push(1)
  const dys = [0]
  if (north <= edgeM) dys.push(-1)
  if (south <= edgeM) dys.push(1)
  const out: { x: number; y: number }[] = []
  for (const dy of dys) for (const dx of dxs) out.push({ x: t.x + dx, y: t.y + dy })
  return out
}

// 飲食店の種類。src/shops/infra/mapShops.ts の FOOD と同じにしておくこと（keep in sync）
const FOOD = new Set(['restaurant', 'cafe', 'fast_food', 'bar', 'pub', 'bakery', 'confectionery', 'ice_cream'])

export type PoiFeature = { id?: number | string; name?: string; subclass?: string; lng: number; lat: number }

// osmId は 'osm:<番号>'。名前のある飲食店の点だけを返す
export function findPoi(features: PoiFeature[], osmId: string): { name: string; subclass: string; lng: number; lat: number } | null {
  if (!osmId.startsWith('osm:')) return null
  const id = osmId.slice(4)
  for (const f of features) {
    if (f.id === undefined || String(f.id) !== id) continue
    if (typeof f.subclass !== 'string' || !FOOD.has(f.subclass)) continue
    if (typeof f.name !== 'string' || f.name.trim() === '') continue
    return { name: f.name, subclass: f.subclass, lng: f.lng, lat: f.lat }
  }
  return null
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

// ---- 気配の部品 ----
// 調整値（設計 §11）。端末の src/hints/config.ts と同じ名前の値はそろえること（keep in sync）
export const HINT_COUNT = 3 // 1組の気配の数
export const HINT_MYSTERY_DAY_RATE = 0.25 // 謎の気配が出る日の割合
export const HINT_MYSTERY_PER_DAY = 1 // 謎の日に混ぜる謎の気配の数
export const HINT_MYSTERY_VERIFY_TRIES = 3 // 謎の気配の店を地図タイルで確かめる最大回数
export const HINT_CATCH_MAX_CHARS = 14 // キャッチの断片の最大文字数
export const HINT_MAX_HP_CANDIDATES = 100 // 受け取る hp 候補の上限
export const HINT_MAX_OSM_CANDIDATES = 50 // 受け取る osm 候補の上限
export const HINT_REGEN_MIN_M = 1500 // 作り直しに要る、今の組からの距離

export type OsmCand = { id: string; lat: number; lng: number }
export type HintsRequest = { regen: boolean; hp: string[]; osm: OsmCand[] }

const HP_ID = /^hp:[A-Za-z0-9]{1,32}$/
const OSM_ID = /^osm:\d+$/

// 本文を確かめる。regen・hp・osm 以外の項目（自宅・現在地など）は読まない
export function parseRequest(body: unknown): HintsRequest | null {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return null
  const { regen, hp, osm } = body as Record<string, unknown>
  if (typeof regen !== 'boolean' || !Array.isArray(hp) || !Array.isArray(osm)) return null
  if (hp.length > HINT_MAX_HP_CANDIDATES || osm.length > HINT_MAX_OSM_CANDIDATES) return null
  const hpOut: string[] = []
  for (const id of hp) {
    if (typeof id !== 'string' || !HP_ID.test(id)) return null
    if (!hpOut.includes(id)) hpOut.push(id)
  }
  const osmOut: OsmCand[] = []
  for (const c of osm) {
    if (typeof c !== 'object' || c === null) return null
    const { id, lat, lng } = c as Record<string, unknown>
    if (typeof id !== 'string' || !OSM_ID.test(id)) return null
    if (typeof lat !== 'number' || typeof lng !== 'number' || !Number.isFinite(lat) || !Number.isFinite(lng)) return null
    if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null
    if (!osmOut.some((o) => o.id === id)) osmOut.push({ id, lat, lng })
  }
  return { regen, hp: hpOut, osm: osmOut }
}

// Fisher–Yates。元の配列は変えない
export function shuffle<T>(xs: readonly T[], random: () => number): T[] {
  const out = [...xs]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    const t = out[i]
    out[i] = out[j]
    out[j] = t
  }
  return out
}

// hp と osm から何件ずつ選ぶか。random() は謎の日の判定に1回だけ使う
export function planDraw(nHp: number, nOsm: number, random: () => number): { hp: number; osm: number } {
  const mystery = random() < HINT_MYSTERY_DAY_RATE && nOsm > 0
  let osm = mystery ? Math.min(HINT_MYSTERY_PER_DAY, nOsm) : 0
  const hp = Math.min(HINT_COUNT - osm, nHp)
  if (hp + osm < HINT_COUNT) osm = Math.min(nOsm, HINT_COUNT - hp) // hp が足りない分を謎の気配で埋める
  return { hp, osm }
}

// hp は抽選順の hp 全部、osmOk はタイルで確かめられた osm。足りない謎の枠は hp の続きで埋める
export function composeDraw(i: { hp: readonly string[]; wantHp: number; osmOk: readonly string[]; wantOsm: number }): string[] {
  const osm = i.osmOk.slice(0, i.wantOsm)
  const hp = i.hp.slice(0, i.wantHp + (i.wantOsm - osm.length))
  return [...hp, ...osm].slice(0, HINT_COUNT)
}

export function centroid(ps: readonly LatLng[]): LatLng {
  let lat = 0
  let lng = 0
  for (const p of ps) {
    lat += p.lat
    lng += p.lng
  }
  return { lat: lat / ps.length, lng: lng / ps.length }
}

// 作り直しで、新しい候補の重心が今の組の重心から minM 以上離れているか（店の位置どうしだけで比べる）
export function farEnough(prev: readonly LatLng[], next: readonly LatLng[], minM = HINT_REGEN_MIN_M): boolean {
  if (prev.length === 0 || next.length === 0) return false
  return distanceM(centroid(prev), centroid(next)) >= minM
}

const BRACKETS = /【[^】]*】|［[^］]*］|\[[^\]]*\]|《[^》]*》|≪[^≫]*≫|〔[^〕]*〕/g
const SEPARATORS = /[。！!？?♪☆★◆◇■□●○／/、,…\s]+/

// キャッチコピーの断片（設計 §6.4）。かっこを消し、区切りで分け、店名・駅・徒歩・3文字以下を外した最初の切れ端
export function catchFragment(catchText: string | null, shopName: string): string | null {
  if (!catchText) return null
  const name = normalizeName(shopName)
  const parts = catchText.replace(BRACKETS, ' ').split(SEPARATORS)
  for (const part of parts) {
    const p = part.trim()
    const chars = Array.from(p)
    if (chars.length <= 3) continue
    if (/駅|徒歩/.test(p)) continue
    if (name !== '' && normalizeName(p).includes(name)) continue
    return chars.length > HINT_CATCH_MAX_CHARS ? chars.slice(0, HINT_CATCH_MAX_CHARS).join('') + '…' : p
  }
  return null
}

// 予算を短く言いかえる（設計 §6.4）。下の端の金額 L で「〜1,000円」「N,000円台」「N万円台」
export function budgetShort(budget: string | null): string | null {
  if (!budget) return null
  const s = budget.normalize('NFKC').replace(/,/g, '').replace(/[～〜~]/g, '~').replace(/\s/g, '')
  const m = s.match(/^(?:(\d+)円?)?(~)?(?:(\d+)円?)?$/)
  if (!m || (m[1] === undefined && m[3] === undefined)) return budget
  const low = m[1] !== undefined ? Number(m[1]) : 0
  if (low < 1000) return '〜1,000円'
  if (low < 10000) return `${Math.floor(low / 1000)},000円台`
  return `${Math.floor(low / 10000)}万円台`
}

export type ShopLite = { shop_id: string; name: string; lat: number; lng: number; genre_name: string | null; catch: string | null; budget_name: string | null }
export type HintRowIn = { slot: number; shop_id: string; hint_genre: string | null; hint_catch: string | null; hint_budget: string | null; is_mystery: boolean }
export type HintRowOut = HintRowIn & { hint_id: string; generation: number; completed_checkin_id: string | null }

// create_daily_hints に渡す1行。謎の気配はヒントを出さない
export function hintRow(shop: ShopLite, slot: number, mystery: boolean): HintRowIn {
  if (mystery) return { slot, shop_id: shop.shop_id, hint_genre: null, hint_catch: null, hint_budget: null, is_mystery: true }
  return {
    slot,
    shop_id: shop.shop_id,
    hint_genre: shop.genre_name || null,
    hint_catch: catchFragment(shop.catch, shop.name),
    hint_budget: budgetShort(shop.budget_name),
    is_mystery: false,
  }
}

// 返事の形（設計 §6.2）。一番大きい generation の組を slot 順に。店の情報が無い行は出さない
export function toResponse(
  day: string,
  rows: readonly HintRowOut[],
  shops: ReadonlyMap<string, { name: string; lat: number; lng: number }>,
): { hint_date: string; generation: number; regen_left: 0 | 1; hints: unknown[] } {
  const generation = rows.reduce((g, r) => Math.max(g, r.generation), 0)
  const hints = rows
    .filter((r) => r.generation === generation && shops.has(r.shop_id))
    .sort((a, b) => a.slot - b.slot)
    .map((r) => {
      const s = shops.get(r.shop_id)!
      return {
        hint_id: r.hint_id,
        slot: r.slot,
        shop_id: r.shop_id,
        hint_genre: r.hint_genre,
        hint_catch: r.hint_catch,
        hint_budget: r.hint_budget,
        is_mystery: r.is_mystery,
        completed: r.completed_checkin_id !== null,
        shop: { name: s.name, lat: s.lat, lng: s.lng },
      }
    })
  return { hint_date: day, generation, regen_left: generation === 1 ? 1 : 0, hints }
}
