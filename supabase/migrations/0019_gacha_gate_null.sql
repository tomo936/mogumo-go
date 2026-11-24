-- 0019: ガチャの門を、app_status の行が無いときも閉じる（2026-11-25 最終セキュリティ確認 低-1）。
--   0018 の `if not (select gacha_open ...)` は、行が無いと NULL になり、IF が偽として扱って抽選へ進んでいた。
--   行が無い・gacha_open が NULL のときは「閉じている」とみなす。中身は 0018 と同じで、coalesce だけ足す。
begin;

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
  if not coalesce((select s.gacha_open from public.app_status s where s.id = 1), false) then
    raise exception 'gacha_closed' using errcode = 'P0001';
  end if;
  return query select * from public._draw_gacha_core(p_type);
end;
$$;

revoke all on function public.draw_gacha(text) from public, anon;
grant execute on function public.draw_gacha(text) to authenticated, service_role;

commit;
