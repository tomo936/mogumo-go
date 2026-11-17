// ガチャの読み書き（SQL 関数 draw_gacha・set_character・my_gacha_state・my_characters。supabase/migrations/0014_gacha.sql）。
// 失敗してもアプリは止めない: 読みは空・null、書きは null・false を返す
import { parseDrawResult, parseGachaState, parseOwned } from '../domain/gacha.ts'
import type { DrawResult, DrawType } from '../domain/gacha.ts'

type Rpc = { rpc(fn: string, args?: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }> }
const client = async (c?: Rpc): Promise<Rpc> => c ?? ((await import('../../lib/supabase.ts')).supabase as unknown as Rpc)

async function call(fn: string, args: Record<string, unknown> | undefined, c?: Rpc): Promise<unknown> {
  try {
    const { data, error } = await (await client(c)).rpc(fn, args)
    return error ? null : data
  } catch {
    return null
  }
}

export async function drawGacha(type: DrawType, c?: Rpc): Promise<DrawResult | null> {
  return parseDrawResult(await call('draw_gacha', { p_type: type }, c))
}

export async function setCharacter(id: number, c?: Rpc): Promise<boolean> {
  return (await call('set_character', { p_character_id: id }, c)) === 'ok'
}

export async function loadGachaState(c?: Rpc) {
  return parseGachaState(await call('my_gacha_state', undefined, c))
}

export async function loadOwned(c?: Rpc): Promise<Map<number, number>> {
  return parseOwned(await call('my_characters', undefined, c))
}

// キャラの絵（全身の原画）。ガチャのキャラは src/assets/gacha/chars/NN.webp（台本 art/prototypes/gacha-chars.py）
const GACHA = import.meta.glob<string>('../../assets/gacha/chars/*.webp', { query: '?url', import: 'default', eager: true })
const STARTER = import.meta.glob<string>('../../assets/characters/starter-*.webp', { query: '?url', import: 'default', eager: true })

export function charArtUrl(id: number): string {
  if (id === 102) return STARTER['../../assets/characters/starter-girl.webp']
  const g = GACHA[`../../assets/gacha/chars/${String(id).padStart(2, '0')}.webp`]
  return g ?? STARTER['../../assets/characters/starter-boy.webp']
}
