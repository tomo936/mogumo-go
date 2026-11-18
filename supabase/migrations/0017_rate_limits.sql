-- 0017 関数ごとの、ユーザー単位の回数の上限（2026-11-18 セキュリティ診断の 2。オーナー承認済み）。
--   関数（service_role）だけが rate_limit_hit を呼ぶ。決まった長さの窓（p_window_s 秒）の中で、p_max 回を超えたら false。
--   アプリの人（authenticated・anon）からは表も関数も触れない。退会すると auth.users から消える（on delete cascade）。
--   何度流しても同じ結果。

create table if not exists public.rate_limits (
  user_id      uuid        not null references auth.users (id) on delete cascade,
  key          text        not null check (char_length(key) between 1 and 64),
  window_start timestamptz not null,
  hits         integer     not null default 0,
  primary key (user_id, key)
);

alter table public.rate_limits enable row level security;
revoke all on table public.rate_limits from public, anon, authenticated;
grant select, insert, update, delete on table public.rate_limits to service_role;

create or replace function public.rate_limit_hit(p_user uuid, p_key text, p_window_s integer, p_max integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hits integer;
  v_now  timestamptz := now();
begin
  insert into public.rate_limits as t (user_id, key, window_start, hits)
  values (p_user, p_key, v_now, 1)
  on conflict (user_id, key) do update set
    window_start = case when t.window_start <= v_now - make_interval(secs => p_window_s) then v_now else t.window_start end,
    hits         = case when t.window_start <= v_now - make_interval(secs => p_window_s) then 1 else t.hits + 1 end
  returning hits into v_hits;
  return v_hits <= p_max;
end;
$$;

revoke all on function public.rate_limit_hit(uuid, text, integer, integer) from public, anon, authenticated;
grant execute on function public.rate_limit_hit(uuid, text, integer, integer) to service_role;
