// お問い合わせ（アプリ内のフォーム）の決まり。サーバーは supabase/migrations/0012_contact.sql の send_inquiry。
// 設計: docs/superpowers/specs/2026-11-17-settings-legal-contact-design.md

export const INQUIRY_KINDS = [
  { id: 'bug', label: '不具合の報告' },
  { id: 'question', label: '使い方の質問' },
  { id: 'request', label: 'ご意見・ご要望' },
  { id: 'account', label: 'アカウント・個人情報' },
  { id: 'other', label: 'その他' },
] as const
export type InquiryKind = (typeof INQUIRY_KINDS)[number]['id']

export const BODY_MAX = 2000
export type SendResult = 'ok' | 'too_many' | 'bad' | 'failed'

// 送れる本文か（前後の空白を除いて 1〜2000 文字）
export function bodyOk(body: string): boolean {
  const n = [...body.trim()].length
  return n >= 1 && n <= BODY_MAX
}

export function parseSendResult(v: unknown): SendResult {
  return v === 'ok' || v === 'too_many' || v === 'bad' ? v : 'failed'
}
