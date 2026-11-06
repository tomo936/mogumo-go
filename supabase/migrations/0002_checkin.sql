-- =============================================================================
-- もぐもGO マイグレーション 0002（チェックイン）
--
-- 目的:
--   - shops に open（営業時間の文字列）を足す
--   - perform_checkin: チェックイン1回分の書き込みを1つの関数（=1トランザクション）で行う
-- 呼び出し元:
--   Edge Function `checkin` だけ（service_role）。authenticated / anon には実行させない。
-- プライバシー:
--   現在地・距離は受け取らない・保存しない。受け取るのは far_from_home の真偽と、
--   サーバーが店の座標から計算したセルの一覧だけ。
-- 適用: Supabase SQL Editor に全体を貼って1回 Run する（冪等ではない）。
-- =============================================================================

begin;

alter table public.shops add column open text null;

create function public.perform_checkin(
  p_user    uuid,
  p_shop_id text,
  p_far     boolean,
  p_day     date,
  p_cells   jsonb   -- [[x, y], ...] 整数の組の配列
)
returns table (checkin_id uuid, coins_awarded int, new_cells jsonb)
language plpgsql
security definer
set search_path = public
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

  -- 1. その店でその日まだコインを付けていなければ reward_day に今日を入れる。
  --    部分一意インデックス checkins_user_shop_reward_day_uniq に当たったら何も入らない。
  insert into public.checkins (user_id, shop_id, far_from_home, reward_day)
  values (p_user, p_shop_id, p_far, p_day)
  on conflict (user_id, shop_id, reward_day) where reward_day is not null do nothing
  returning checkins.checkin_id into v_id;

  if v_id is not null then
    v_rewarded := true;
  else
    -- すでに今日コイン済み: reward_day なし（NULL）で1行だけ残す
    insert into public.checkins (user_id, shop_id, far_from_home, reward_day)
    values (p_user, p_shop_id, p_far, null)
    returning checkins.checkin_id into v_id;
  end if;

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

revoke execute on function public.perform_checkin(uuid, text, boolean, date, jsonb)
  from public, anon, authenticated;
grant execute on function public.perform_checkin(uuid, text, boolean, date, jsonb)
  to service_role;

commit;
