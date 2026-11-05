export const NICKNAME_MAX = 10

export type NicknameCheck = { ok: true; value: string } | { ok: false; reason: 'empty' | 'tooLong' }

// 文字数は Unicode のコードポイント数で数える（DB の char_length と同じ。DB 詳細設計 D-05）
const length = (s: string) => [...s].length

export function checkNickname(raw: string): NicknameCheck {
  const value = raw.trim()
  if (value === '') return { ok: false, reason: 'empty' }
  if (length(value) > NICKNAME_MAX) return { ok: false, reason: 'tooLong' }
  return { ok: true, value }
}

export function remainingChars(raw: string): number {
  return NICKNAME_MAX - length(raw.trim())
}
