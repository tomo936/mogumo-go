// 日の出・日の入り（A14。昼と夜の切り替えの基準。2026-11-17 オーナー「A: 日の入り・日の出」）。
// NOAA の簡易式（太陽の中心が地平線の下 0.833° = 大気の屈折と太陽の半径の分）。誤差は日本で数分。

const RAD = Math.PI / 180
const DAY_MS = 86_400_000

// その日（UTC の日付ではなく、経度から見たその土地の正午を含む日）の日の出・日の入り。白夜・極夜は null
export function sunTimes(date: Date, lat: number, lng: number): { rise: Date; set: Date } | null {
  // その土地の正午ごろの日を、2000-01-01 12:00 UTC からの日数で
  const localNoon = Math.round((date.getTime() + (lng / 360) * DAY_MS - DAY_MS / 2) / DAY_MS) // 日の通し番号（UTC 0 時基準）
  const n = localNoon - 10957 + 0.0008 - lng / 360 // 平均太陽正午（J2000 からの日数）
  const M = (357.5291 + 0.98560028 * n) % 360 // 平均近点角
  const C = 1.9148 * Math.sin(M * RAD) + 0.02 * Math.sin(2 * M * RAD) + 0.0003 * Math.sin(3 * M * RAD)
  const L = (M + C + 180 + 102.9372) % 360 // 黄経
  const transit = n + 0.0053 * Math.sin(M * RAD) - 0.0069 * Math.sin(2 * L * RAD) // 太陽が真南に来る（J2000 からの日数）
  const decl = Math.asin(Math.sin(L * RAD) * Math.sin(23.4397 * RAD))
  const cosH = (Math.sin(-0.833 * RAD) - Math.sin(lat * RAD) * Math.sin(decl)) / (Math.cos(lat * RAD) * Math.cos(decl))
  if (cosH < -1 || cosH > 1) return null
  const H = Math.acos(cosH) / RAD / 360 // 日の出から南中までの日数
  const toDate = (j: number) => new Date((j + 10957 + 0.5) * DAY_MS) // J2000 からの日数 → 時刻（2000-01-01 12:00 UTC が 0）
  return { rise: toDate(transit - H), set: toDate(transit + H) }
}

// 夜 = 日の入りから次の日の出まで
export function isNightAt(now: Date, lat: number, lng: number): boolean {
  const t = sunTimes(now, lat, lng)
  if (!t) return false
  return now < t.rise || now >= t.set
}
