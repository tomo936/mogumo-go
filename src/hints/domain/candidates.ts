// 気配の候補集め（端末が候補、サーバーが抽選）。送るのは hp の id と osm の id・店の位置だけ。
import { isClearedAt } from '../../fog/domain/clearing.ts'
import type { Cleared } from '../../fog/domain/clearing.ts'
import { distanceMeters } from '../../map/domain/geo.ts'
import type { LatLng } from '../../map/domain/geo.ts'
import type { Shop } from '../../shops/domain/shop.ts'
import { isChainName } from './chain.ts'
import { HINT_AWAY_RADIUS_M, HINT_HOME_RADIUS_M, HINT_MAX_HP_CANDIDATES, HINT_MAX_OSM_CANDIDATES } from '../config.ts'

export type Candidates = { hp: string[]; osm: { id: string; lat: number; lng: number }[] }

type In = {
  shops: readonly Shop[]
  cleared: Cleared
  checked: ReadonlySet<string>
  home: LatLng | null
  me: LatLng
  regen: boolean
  random: () => number
}

function inRange(s: Shop, i: In): boolean {
  const nearMe = distanceMeters(i.me, s) <= HINT_AWAY_RADIUS_M
  if (i.regen || !i.home) return nearMe
  const nearHome = distanceMeters(i.home, s) <= HINT_HOME_RADIUS_M
  const atHome = distanceMeters(i.home, i.me) <= HINT_HOME_RADIUS_M
  return atHome ? nearHome : nearHome || nearMe
}

// 先頭 n 件だけランダムに選ぶ（Fisher–Yates の途中まで）
function sample<T>(xs: readonly T[], n: number, random: () => number): T[] {
  if (xs.length <= n) return [...xs]
  const a = [...xs]
  for (let i = 0; i < n; i++) {
    const j = i + Math.floor(random() * (a.length - i))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a.slice(0, n)
}

export function collectCandidates(i: In): Candidates {
  const hp: string[] = []
  const osm: Candidates['osm'] = []
  for (const s of i.shops) {
    if (s.name === '') continue
    if (isChainName(s.name)) continue
    if (isClearedAt(i.cleared, s)) continue
    if (i.checked.has(s.id) || (s.mapId && i.checked.has(s.mapId))) continue
    if (!inRange(s, i)) continue
    if (s.id.startsWith('hp:')) hp.push(s.id)
    else if (s.id.startsWith('osm:') && s.details === null) osm.push({ id: s.id, lat: s.lat, lng: s.lng })
  }
  return { hp: sample(hp, HINT_MAX_HP_CANDIDATES, i.random), osm: sample(osm, HINT_MAX_OSM_CANDIDATES, i.random) }
}
