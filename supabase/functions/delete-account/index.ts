// Supabase Edge Function（Deno）。退会: 本人のデータを全部消す。
// 受け取る: POST（JWT 必須。本文は無し）。消す人は JWT からだけ決める（ほかの人は消せない）。
// 消すもの: 感想の写真（バケット review-photos の <user_id>/ の下）→ ログインのアカウント（auth.users）。
//   表のデータは auth.users → profiles から on delete cascade で全部消える（問い合わせの行は user_id が空になって残る）。
// 設計: docs/superpowers/specs/2026-11-17-settings-legal-contact-design.md
// プライバシー: ユーザーID・トークンをログに出さない。
import { withCors } from '../_shared/cors.ts'
import { createClient } from 'npm:@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

const BUCKET = 'review-photos'
const PAGE = 100

Deno.serve(withCors(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })
  if (req.method !== 'POST') return json({ error: 'bad_request' }, 400)

  const token = (req.headers.get('Authorization') ?? '').match(/^Bearer\s+(.+)$/i)?.[1]
  if (!token) return json({ error: 'unauthorized' }, 401)

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: auth, error: authError } = await db.auth.getUser(token)
  if (authError || !auth.user) return json({ error: 'unauthorized' }, 401)
  const userId = auth.user.id

  try {
    // 1. 写真（消しても次の一覧で残りが出なくなるまで繰り返す）
    for (let round = 0; round < 50; round++) {
      const { data: files, error } = await db.storage.from(BUCKET).list(userId, { limit: PAGE })
      if (error) throw new Error('list_failed')
      const paths = (files ?? []).filter((f) => f.name).map((f) => `${userId}/${f.name}`)
      if (paths.length === 0) break
      const { error: rmError } = await db.storage.from(BUCKET).remove(paths)
      if (rmError) throw new Error('remove_failed')
    }
    // 2. アカウント（表は cascade で消える）
    const { error: delError } = await db.auth.admin.deleteUser(userId)
    if (delError) throw new Error('delete_user_failed')
    return json({ ok: true }, 200)
  } catch (e) {
    console.error('delete-account failed', e instanceof Error ? e.message : 'unknown')
    return json({ error: 'failed' }, 500)
  }
}))
