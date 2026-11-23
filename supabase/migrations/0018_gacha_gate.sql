-- 0018: ガチャを「サーバーでも」閉じる（2026-11-23。総点検 H1: 画面を閉じていても draw_gacha を直接呼べた）。
--   app_status.gacha_open（初期 false）が true になるまで、draw_gacha は 'gacha_closed' で断る。
--   開けるとき（オーナーの確認のあと）: Supabase の Table Editor で app_status の gacha_open を true にする。画面側は src/gacha/config.ts の GACHA_OPEN。
--   抽選の本体は今までの関数を名前だけ替えて残し（_draw_gacha_core。アプリからは呼べない）、入口の draw_gacha が開いているかを見てから呼ぶ。
begin;

alter table public.app_status add column if not exists gacha_open boolean not null default false;

alter function public.draw_gacha(text) rename to _draw_gacha_core;
revoke all on function public._draw_gacha_core(text) from public, anon, authenticated;
grant execute on function public._draw_gacha_core(text) to service_role;

create or replace function public.draw_gacha(p_type text)
returns table (
  pos          smallint,
  character_id smallint,
  rarity       smallint,
  guarantee    text,
  is_new       boolean,
  friendship   integer,
  status       text
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (select s.gacha_open from public.app_status s where s.id = 1) then
    raise exception 'gacha_closed' using errcode = 'P0001';
  end if;
  return query select * from public._draw_gacha_core(p_type);
end;
$$;

revoke all on function public.draw_gacha(text) from public, anon;
grant execute on function public.draw_gacha(text) to authenticated, service_role;

commit;
