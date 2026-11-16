// メンテナンス（A8）の決まり。設計 docs/superpowers/specs/2026-11-17-maintenance-design.md
// サーバー（SQL 関数 maintenance_status、0010_maintenance.sql）の返事の読み取りと、終わる予定の文。

export type MaintenanceStatus = { on: boolean; message: string; endsAt: string | null }

export const CHECK_EVERY_MS = 60_000 // 開いている間に確かめる間隔

export function parseStatus(data: unknown): MaintenanceStatus | null {
  const row = Array.isArray(data) ? data[0] : null
  if (!row || typeof row !== 'object') return null
  const r = row as Record<string, unknown>
  if (typeof r.maintenance !== 'boolean') return null
  return {
    on: r.maintenance,
    message: typeof r.message === 'string' ? r.message : '',
    endsAt: typeof r.ends_at === 'string' ? r.ends_at : null,
  }
}

const JST_MS = 9 * 3600_000

// 「18:00ごろ終わる予定」（今日・日本時間）／「11月21日 9:30ごろ終わる予定」。予定が無い・過ぎたら null
export function endsLabel(endsAt: string | null, now: Date): string | null {
  if (!endsAt) return null
  const t = Date.parse(endsAt)
  if (Number.isNaN(t) || t <= now.getTime()) return null
  const end = new Date(t + JST_MS)
  const today = new Date(now.getTime() + JST_MS)
  const hm = `${end.getUTCHours()}:${String(end.getUTCMinutes()).padStart(2, '0')}`
  const sameDay = end.getUTCFullYear() === today.getUTCFullYear() && end.getUTCMonth() === today.getUTCMonth() && end.getUTCDate() === today.getUTCDate()
  return sameDay ? `${hm}ごろ終わる予定` : `${end.getUTCMonth() + 1}月${end.getUTCDate()}日 ${hm}ごろ終わる予定`
}
