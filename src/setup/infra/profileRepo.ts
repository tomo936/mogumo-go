import type { SupabaseClient } from '@supabase/supabase-js'
import { supabase } from '../../lib/supabase.ts'

export type StarterId = 101 | 102

// characterId: いま使っているキャラ（ガチャのキャラも。SQL 0014 の current_character_id、空なら最初のキャラ）
export type Profile = { nickname: string; starterId: StarterId; characterId: number }

export type ProfileRepo = {
  exists(userId: string): Promise<boolean>
  load(userId: string): Promise<Profile | null>
  create(input: { nickname: string; starterId: StarterId }): Promise<void>
  updateNickname(userId: string, nickname: string): Promise<void>
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
      // '*' で読む: SQL 0014 を流す前（current_character_id の列が無い）でも読めるように
      const { data, error } = await client.from('profiles').select('*').eq('user_id', userId).maybeSingle()
      if (error) throw new Error('profiles の読み込みに失敗しました')
      if (!data) return null
      const starterId = data.starter_character_id === 102 ? 102 : 101
      const current = typeof data.current_character_id === 'number' ? data.current_character_id : null
      return { nickname: String(data.nickname), starterId, characterId: current ?? starterId }
    },
    async create({ nickname, starterId }) {
      const { error } = await client.from('profiles').insert({ nickname, starter_character_id: starterId })
      if (error) throw new Error('profiles の作成に失敗しました')
    },
    // マイページのニックネームの変更（S15: 後から変更可・重複OK）
    async updateNickname(userId, nickname) {
      // 行が無い・権限で弾かれた（0 行の更新）ときも失敗として知らせる
      const { data, error } = await client.from('profiles').update({ nickname }).eq('user_id', userId).select('user_id')
      if (error || !Array.isArray(data) || data.length === 0) throw new Error('profiles の更新に失敗しました')
    },
  }
}

export const profileRepo = createProfileRepo(supabase)
