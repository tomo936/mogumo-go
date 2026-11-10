// 週ミッション（サーバーの関数 weekly-missions の返事）と、画面に出す文。純粋な計算だけ。
// 設計: docs/superpowers/specs/2026-11-10-weekly-missions-design.md
import { KIND_LABEL } from '../../shops/domain/kindLabel.ts'
import type { ShopKind } from '../../shops/domain/shop.ts'

export type Difficulty = 'easy' | 'normal' | 'hard'
export type Mission = {
  id: string
  difficulty: Difficulty
  type: string
  key: string
  kinds: ShopKind[]
  target: number
  progress: number
  reward: number
  completed: boolean
}
export type MissionWeek = { weekEnd: string; missions: Mission[]; newly: string[] }

export const DIFFICULTY_LABEL: Record<Difficulty, string> = { easy: 'かんたん', normal: 'ふつう', hard: 'むずかしい' }

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null
const KINDS = new Set(Object.keys(KIND_LABEL))

// 返事を読む。形が違えば null
export function parseWeek(json: unknown): MissionWeek | null {
  if (!isObj(json) || !Array.isArray(json.missions) || typeof json.week_end !== 'string') return null
  const missions: Mission[] = []
  for (const r of json.missions) {
    if (!isObj(r)) return null
    const d = r.difficulty
    if (typeof r.mission_id !== 'string' || (d !== 'easy' && d !== 'normal' && d !== 'hard')) return null
    if (typeof r.target !== 'number' || typeof r.progress !== 'number' || typeof r.reward !== 'number') return null
    const p = isObj(r.params) ? r.params : {}
    const kinds = Array.isArray(p.kinds) ? (p.kinds.filter((k) => typeof k === 'string' && KINDS.has(k)) as ShopKind[]) : []
    missions.push({
      id: r.mission_id, difficulty: d, type: typeof r.condition_type === 'string' ? r.condition_type : '',
      key: typeof p.key === 'string' ? p.key : '', kinds, target: r.target, progress: r.progress, reward: r.reward, completed: r.completed === true,
    })
  }
  const newly = Array.isArray(json.newly) ? json.newly.filter((x): x is string => typeof x === 'string') : []
  return { weekEnd: json.week_end, missions, newly }
}

const kindName = (m: Mission) => (m.kinds[0] ? KIND_LABEL[m.kinds[0]] : 'お店')

// 名前（チケットの大きな文字）
export function missionTitle(m: Mission): string {
  switch (m.key) {
    case 'hint_trail': return '気配をたどって'
    case 'hajimemashite': return 'はじめましての1軒'
    case 'genre_week': return `今週の${kindName(m)}`
    case 'oyatsu': return 'おやつタイム'
    case 'mata': return 'また来たよ'
    case 'far2': return '霧の向こうへ'
    case 'kaitaku': return '開拓日和'
    case 'meguri': return `${kindName(m)}めぐり`
    case 'sanshoku': return '三色だんご'
    case 'hint_hunter': return '気配ハンター'
    case 'lunch': return 'お昼の散歩'
    case 'harema': return '晴れ間をひろげる'
    case 'daikaitaku': return '大開拓'
    case 'far4': return '遠くの町まで'
    case 'itsutsu': return '五つの味'
    case 'hint_master': return '気配の達人'
    case 'mainichi': return '毎日がグルメ'
    case 'hashigo': return 'はしごの日'
    case 'weekend': return '週末の冒険'
    default: return '今週のミッション'
  }
}

// 条件の短い文（押したときの詳しい説明にも使う）
export function missionCondition(m: Mission): string {
  const n = m.target
  switch (m.type) {
    case 'hint_shop': return `気配のお店に${n}回`
    case 'first_visit': return `はじめてのお店に${n}軒`
    case 'revisit': return '前に行ったお店にもう一度'
    case 'genre': return m.key === 'oyatsu' ? 'カフェ・スイーツ・パンのお店に1軒' : `${kindName(m)}のお店に${n}軒`
    case 'far_from_home': return `自宅から500m以上先のお店に${n}軒`
    case 'distinct_kinds': return `ちがうジャンルのお店を${n}種類`
    case 'lunch': return `お昼（11〜14時）に${n}回`
    case 'fog_cells': return `チェックインで晴れたマスを${n}`
    case 'active_days': return `${n}日以上お店に行く`
    case 'hashigo_days': return `1日に2軒行く日を${n}回`
    case 'weekend': return `土日に${n}軒`
    default: return ''
  }
}

// 日曜（週の最後の日）までの、今日を含めた日数
export function daysLeftUntil(weekEnd: string, now: Date): number {
  const today = new Date(now.getTime() + 9 * 3600_000).toISOString().slice(0, 10)
  const diff = Math.round((Date.parse(`${weekEnd}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000)
  return Math.max(1, diff + 1)
}
