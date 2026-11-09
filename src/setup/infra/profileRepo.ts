import type { SupabaseClient } from '@supabase/supabase-js'
import { supabase } from '../../lib/supabase.ts'

export type StarterId = 101 | 102

export type ProfileRepo = {
  exists(userId: string): Promise<boolean>
  load(userId: string): Promise<{ nickname: string; starterId: StarterId } | null>
  create(input: { nickname: string; starterId: StarterId }): Promise<void>
}

// profiles に送るのはニックネームとキャラの番号だけ。自宅の位置は送らない
export function createProfileRepo(client: SupabaseClient): ProfileRepo {
  return {
    async exists(userId) {
      const { data, error } = await client.from('profiles').select('user_id').eq('user_id', userId).maybeSingle()
      if (error) throw new Error('profiles の読み込みに失敗しました')
      return data !== null
    },
    async load(userId) {
      const { data, error } = await client.from('profiles').select('nickname, starter_character_id').eq('user_id', userId).maybeSingle()
      if (error) throw new Error('profiles の読み込みに失敗しました')
      if (!data) return null
      const starterId = data.starter_character_id === 102 ? 102 : 101
      return { nickname: String(data.nickname), starterId }
    },
    async create({ nickname, starterId }) {
      const { error } = await client.from('profiles').insert({ nickname, starter_character_id: starterId })
      if (error) throw new Error('profiles の作成に失敗しました')
    },
  }
}

export const profileRepo = createProfileRepo(supabase)
