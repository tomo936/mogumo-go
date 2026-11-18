-- =============================================================================
-- もぐもGO マイグレーション 0003（同じお店のチェックインは1日1回）
--
-- 0002 の perform_checkin を置き換える。同じお店・同じ日（JST）の2回目は記録もコインも付けず、
-- 'already_today'（errcode P0001）で止める。Edge Function `checkin` が 409 already_today にする。
-- 権限（service_role だけ実行できる）は create or replace でもそのまま残る。
-- 適用: 0002 のあとに、Supabase SQL Editor に全体を貼って Run する（何度流しても同じ結果）。
-- =============================================================================

begin;

create or replace function public.perform_checkin(
  p_user    uuid,
  p_shop_id text,
  p_far     boolean,
  p_day     date,
  p_cells   jsonb   -- [[x, y], ...] 整数の組の配列
)
returns table (checkin_id uuid, coins_awarded int, new_cells jsonb)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_id      uuid;
  v_rewarded boolean := false;
begin
  -- プロフィールが無ければ外部キー違反（23503）で止める → Edge Function が 409 にする
  if not exists (select 1 from public.profiles pr where pr.user_id = p_user) then
    raise exception 'profile_missing' using errcode = '23503';
  end if;

  -- 1. 同じお店のチェックインは1日1回（本人決定 2026-11-07）。
  --    部分一意インデックス checkins_user_shop_reward_day_uniq に当たったら、今日はもう済み → 止める
  insert into public.checkins (user_id, shop_id, far_from_home, reward_day)
  values (p_user, p_shop_id, p_far, p_day)
  on conflict (user_id, shop_id, reward_day) where reward_day is not null do nothing
  returning checkins.checkin_id into v_id;

  if v_id is null then
    raise exception 'already_today' using errcode = 'P0001';
  end if;
  v_rewarded := true;

  -- 2. コインは reward_day を入れたときだけ（coin_ledger_checkin_reason_uniq でも二重を防ぐ）
  if v_rewarded then
    insert into public.coin_ledger (user_id, reason, amount, checkin_id)
    values (p_user, 'checkin', 30, v_id);
  end if;

  -- 3. 店のまわりのセルを晴らす。すでに晴れているセルは何もしない。今回新しく晴れた分を返す
  with ins as (
    insert into public.fog_cells (user_id, cell_x, cell_y, source)
    select p_user, (e ->> 0)::int, (e ->> 1)::int, 'shop_radius'
    from jsonb_array_elements(p_cells) as e
    on conflict (user_id, cell_x, cell_y) do nothing
    returning fog_cells.cell_x, fog_cells.cell_y
  )
  select coalesce(jsonb_agg(jsonb_build_array(ins.cell_x, ins.cell_y)), '[]'::jsonb)
    into new_cells
    from ins;

  checkin_id := v_id;
  coins_awarded := case when v_rewarded then 30 else 0 end;
  return next;
end;
$$;

commit;
