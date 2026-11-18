// 自宅の位置。端末の中だけに置き、サーバーには送らない（SPEC §2.5）
export type Home = { lat: number; lng: number }

const inRange = (v: unknown, max: number): v is number => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= max

export function parseHome(text: string | null): Home | null {
  if (text === null) return null
  try {
    const v: unknown = JSON.parse(text)
    if (typeof v !== 'object' || v === null || Array.isArray(v)) return null
    const { lat, lng } = v as Record<string, unknown>
    return inRange(lat, 90) && inRange(lng, 180) ? { lat, lng } : null
  } catch {
    return null
  }
}
