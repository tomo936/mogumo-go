import { createClient } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'

export function createSupabase(url: string | undefined, key: string | undefined): SupabaseClient {
  if (!url || !key) {
    throw new Error('VITE_SUPABASE_URL と VITE_SUPABASE_ANON_KEY を設定してください')
  }
  return createClient(url, key)
}

export const supabase = createSupabase(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
)
