// 退会（関数 supabase/functions/delete-account/）。サーバーで消せたら、端末のこの人のデータも消す。
// ログアウトと画面の移動は呼び出し側
import { keysOfUser } from '../domain/localKeys.ts'

const TIMEOUT_MS = 30_000

async function postDelete(): Promise<boolean> {
  try {
    const { supabase } = await import('../../lib/supabase.ts')
    const token = (await supabase.auth.getSession()).data.session?.access_token
    if (!token) return false
    const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/delete-account`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, apikey: import.meta.env.VITE_SUPABASE_ANON_KEY },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    return res.ok
  } catch {
    return false
  }
}

export async function deleteAccount(userId: string, post: () => Promise<boolean> = postDelete): Promise<boolean> {
  if (!(await post())) return false
  try {
    const keys = Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i) ?? '')
    for (const k of keysOfUser(keys, userId)) localStorage.removeItem(k)
  } catch {
    // 端末に書けなくても、サーバーでは消えている
  }
  return true
}
