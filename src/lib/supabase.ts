import { createClient } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'
import { CONFIG_ERROR } from './config.ts'

export function createSupabase(url: string | undefined, key: string | undefined): SupabaseClient {
  if (!url || !key) {
    throw new Error(CONFIG_ERROR)
  }
  return createClient(url, key)
}

export const supabase = createSupabase(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
)
