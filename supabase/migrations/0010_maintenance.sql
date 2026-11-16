-- =============================================================================
-- もぐもGO マイグレーション 0010（メンテナンス: A8）
--
-- 決まり（SPEC A8・設計 docs/superpowers/specs/2026-11-17-maintenance-design.md）:
--   - 1 行だけの表 app_status に「メンテ中か」「お知らせの文」「終わる予定の時刻」を置く。
--   - アプリは起動時・戻ってきたとき・開いている間 1 分ごとに maintenance_status() を読み、メンテ中ならメンテの画面だけを出す。
--   - サーバー側で書き込みは断らない（オーナー決定 2026-11-17「A で」）。
-- 適用: 0009 のあとに、Supabase SQL Editor に全体を貼って Run する（何度流しても同じ結果）。
--
-- 使い方（運営）: Supabase の Table Editor で public.app_status の 1 行を書き換える。
--   メンテに入る: maintenance = true、message に文（空でもよい）、ends_at に終わる予定（空でもよい）
--   メンテを終える: maintenance = false
--   SQL なら: update public.app_status set maintenance = true, message = '新しい町を追加しています', ends_at = '2026-11-20 18:00+09' where id = 1;
-- =============================================================================

create table if not exists public.app_status (
  id          integer     primary key default 1 check (id = 1), -- 1 行だけ
  maintenance boolean     not null default false,
  message     text        not null default '' check (char_length(message) <= 200),
  ends_at     timestamptz,
  updated_at  timestamptz not null default now()
);

insert into public.app_status (id) values (1) on conflict (id) do nothing;

alter table public.app_status enable row level security;
-- アプリからは表を直接読み書きしない（読むのは下の関数だけ。書くのは運営が Supabase の画面で）
revoke all on table public.app_status from public, anon, authenticated;

-- maintenance_status: 今のメンテの様子（ログイン前でも読める）
create or replace function public.maintenance_status()
returns table (maintenance boolean, message text, ends_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select s.maintenance, s.message, s.ends_at from public.app_status s where s.id = 1;
$$;

revoke all on function public.maintenance_status() from public;
grant execute on function public.maintenance_status() to anon, authenticated, service_role;
