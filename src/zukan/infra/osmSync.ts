// 晴れたマスが載っているタイルを関数 shops-osm に送る（地図に読み込んでいない晴れた場所も）。送った日は端末に置く（同じタイルは 7 日に 1 回）。
// 失敗したタイルは「送った」にしないので、次の機会に送り直す。失敗してもアプリは止めない。
import { jstDay } from '../../checkin/domain/day.ts'
import { dueTiles, tileKey, tilesOfCleared } from '../domain/osmTiles.ts'
import type { Tile } from '../domain/osmTiles.ts'

const KEY = (userId: string) => `mogumo.osmSync.${userId}`
const TIMEOUT_MS = 25000

function readSent(userId: string): Record<string, string> {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(KEY(userId)) ?? '{}')
    if (typeof v !== 'object' || v === null) return {}
    const out: Record<string, string> = {}
    for (const [k, d] of Object.entries(v)) if (typeof d === 'string') out[k] = d
    return out
  } catch {
    return {}
  }
}

function writeSent(userId: string, sent: Record<string, string>): void {
  try {
    localStorage.setItem(KEY(userId), JSON.stringify(sent))
  } catch {
    // 置けなくても次にまた送るだけ
  }
}

async function postTiles(tiles: Tile[]): Promise<boolean> {
  try {
    const { supabase } = await import('../../lib/supabase.ts')
    const token = (await supabase.auth.getSession()).data.session?.access_token
    if (!token) return false
    const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/shops-osm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, apikey: import.meta.env.VITE_SUPABASE_ANON_KEY },
      body: JSON.stringify({ tiles }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    return res.ok
  } catch {
    return false
  }
}

let running = false

export async function syncOsmShops(
  userId: string,
  cleared: ReadonlySet<string>,
  opts: { post?: (tiles: Tile[]) => Promise<boolean>; now?: Date } = {},
): Promise<void> {
  if (running) return
  const sent = readSent(userId)
  const today = jstDay(opts.now ?? new Date())
  const tiles = dueTiles(tilesOfCleared(cleared), sent, today)
  if (tiles.length === 0) return
  running = true
  try {
    if (await (opts.post ?? postTiles)(tiles)) {
      for (const t of tiles) sent[tileKey(t)] = today
      writeSent(userId, sent)
    }
  } finally {
    running = false
  }
}
