import { beforeAll, expect, test, vi } from 'vitest'
import type { createSupabase as CreateSupabase } from './supabase.ts'

const message = /VITE_SUPABASE_URL.*VITE_SUPABASE_ANON_KEY/
let createSupabase: typeof CreateSupabase

beforeAll(async () => {
  // モジュール読み込み時に本物の環境変数を読むため、テスト用の値を入れてから読む
  vi.stubEnv('VITE_SUPABASE_URL', 'https://test.supabase.co')
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'test-anon-key')
  ;({ createSupabase } = await import('./supabase.ts'))
})

test('URL が無いと分かる文言で止まる', () => {
  expect(() => createSupabase(undefined, 'x')).toThrow(message)
})

test('anon キーが無いと分かる文言で止まる', () => {
  expect(() => createSupabase('https://a.supabase.co', undefined)).toThrow(message)
})
