// お問い合わせを送る（SQL 関数 send_inquiry）。返事の宛先（ログインのメール）はサーバーが付ける
import { parseSendResult } from '../domain/inquiry.ts'
import type { InquiryKind, SendResult } from '../domain/inquiry.ts'

type Rpc = { rpc(fn: string, args?: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }> }
const client = async (c?: Rpc): Promise<Rpc> => c ?? ((await import('../../lib/supabase.ts')).supabase as unknown as Rpc)

export async function sendInquiry(kind: InquiryKind, body: string, appVersion: string, c?: Rpc): Promise<SendResult> {
  try {
    const { data, error } = await (await client(c)).rpc('send_inquiry', {
      p_category: kind,
      p_body: body.trim(),
      p_app_version: appVersion,
      p_device: typeof navigator === 'undefined' ? '' : navigator.userAgent.slice(0, 300),
    })
    return error ? 'failed' : parseSendResult(data)
  } catch {
    return 'failed'
  }
}
