-- =============================================================================
-- もぐもGO マイグレーション 0004（気配・デイリー）
--
-- 目的（設計 docs/superpowers/specs/2026-11-07-daily-hints-design.md §5.2）:
--   1. daily_hints に generation（その日の何組目か。1 か 2）を足し、一意制約を generation 込みに付けかえる
--   2. create_daily_hints: その日の気配を「無ければ作る／あれば返す」と「作り直し（1日1回）」を1トランザクションで行う
--   3. perform_checkin を置き換える: 引数 p_alt_shop_id を足し、今日の今の組の気配の店なら +10（合計40）、
--      checkins.was_hint・daily_hints.completed_checkin_id を書き、戻り値に was_hint を足す
-- 呼び出し元:
--   Edge Function `daily-hints`（create_daily_hints）と `checkin`（perform_checkin）だけ（service_role）。
--   authenticated / anon には実行させない。
-- プライバシー:
--   自宅・現在地・距離・方角は受け取らない・保存しない。
-- 適用: 0003 のあとに、Supabase SQL Editor に全体を貼って Run する（何度流しても同じ結果）。
--   古い perform_checkin を消すので、流したらすぐ関数 `checkin` を新しい版に置き直すこと
--   （その間はチェックインが失敗する）。
--
-- -----------------------------------------------------------------------------
-- 流す前に: 0001 の一意制約の今の名前を確かめる（下の drop の名前と同じか）
--   select conname from pg_constraint where conrelid = 'public.daily_hints'::regclass;
--   → daily_hints_user_id_hint_date_slot_key と daily_hints_user_id_hint_date_shop_id_key があるはず。
--     流したあとは daily_hints_user_day_gen_slot_key・daily_hints_user_day_gen_shop_key・
--     daily_hints_generation_check に変わっていること。
--
-- 手で確かめる（開発用 mogumo-go-dev の SQL Editor。設計 §10「DB」）。
--   :u は自分の user_id、:d は今日（JST）の日付、店 id は shops にあるものに置きかえる。
--   SQL Editor は service_role 相当で動くので、関数を直接呼べる。
--
--   -- 1. 同じ日に2回作っても1組（2回目は何も書かず、1回目の組を返す）
--   select * from public.create_daily_hints(:u, :d, false,
--     '[{"slot":1,"shop_id":"hp:A","hint_genre":"中華","hint_catch":null,"hint_budget":null,"is_mystery":false}]');
--   select * from public.create_daily_hints(:u, :d, false,
--     '[{"slot":1,"shop_id":"hp:B","hint_genre":"カフェ","hint_catch":null,"hint_budget":null,"is_mystery":false}]');
--   select generation, slot, shop_id from public.daily_hints where user_id = :u and hint_date = :d;
--   → generation 1 の hp:A の1行だけ
--
--   -- 2. 作り直しで generation 2 ができ、古い組（generation 1）は残る
--   select * from public.create_daily_hints(:u, :d, true,
--     '[{"slot":1,"shop_id":"hp:B","hint_genre":"カフェ","hint_catch":null,"hint_budget":null,"is_mystery":false}]');
--   → generation 2 の hp:B が返る。daily_hints には generation 1 の hp:A も残っている
--
--   -- 3. 2回目の作り直しは regen_used（ERROR: regen_used、SQLSTATE P0001）
--   select * from public.create_daily_hints(:u, :d, true, '[]');
--
--   -- 4. 作り直しで p_rows が空なら何も書かず今の組を返す（回数を使わない）
--   --    （generation 1 だけの日に）select * from public.create_daily_hints(:u, :d, true, '[]');
--   --    → generation 1 の組が返り、generation 2 はできない
--
--   -- 5. 組が無い日の作り直しは no_hints
--   select * from public.create_daily_hints(:u, :d + 1, true, '[]');
--
--   -- 6. 気配の店へのチェックインで 30＋10 の2行・was_hint = true・completed_checkin_id が入る
--   select * from public.perform_checkin(:u, 'hp:B', false, :d, '[]', null);
--   → coins_awarded 40、was_hint true
--   select reason, amount from public.coin_ledger where checkin_id = '<返った checkin_id>';  → checkin 30・hint_bonus 10
--   select was_hint from public.checkins where checkin_id = '<返った checkin_id>';            → true
--   select completed_checkin_id from public.daily_hints where user_id = :u and hint_date = :d and shop_id = 'hp:B';
--
--   -- 7. 達成後の作り直しは regen_done（generation 1 で達成した日に試す）
--   select * from public.create_daily_hints(:u, :d, true, '[]');
--
--   -- 8. 気配でない店・作り直す前の組の店（上の hp:A）・昨日の気配の店は 30 だけ（was_hint false）
--   select * from public.perform_checkin(:u, 'hp:A', false, :d, '[]', null);
--
--   -- 9. p_alt_shop_id で同じ店の別の id を気配として数える（気配が osm:Y、チェックインが hp:X）
--   select * from public.perform_checkin(:u, 'hp:X', false, :d, '[]', 'osm:Y');  → 40
--
--   -- 10. 他人の daily_hints は読めない（RLS）。ブラウザ（authenticated）で
--   --     supabase.from('daily_hints').select('*') → 自分の行だけ
--
--   -- 11. authenticated から2つの関数を実行できない
--   select has_function_privilege('authenticated', 'public.create_daily_hints(uuid, date, boolean, jsonb)', 'execute');
--   select has_function_privilege('authenticated', 'public.perform_checkin(uuid, text, boolean, date, jsonb, text)', 'execute');
--   → どちらも false（anon も同じ）。service_role は true
--
--   後片付け: delete from public.daily_hints where user_id = :u and hint_date = :d;
--   （checkins・coin_ledger は試した分を手で消す）
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1. daily_hints.generation と一意制約の付けかえ
-- -----------------------------------------------------------------------------
alter table public.daily_hints
  add column if not exists generation smallint not null default 1;

alter table public.daily_hints drop constraint if exists daily_hints_generation_check;
alter table public.daily_hints
  add constraint daily_hints_generation_check check (generation between 1 and 2);

-- 0001 の自動の名前（作り直した組に前の組と同じ店・同じ slot が入れるように外す）
alter table public.daily_hints drop constraint if exists daily_hints_user_id_hint_date_slot_key;
alter table public.daily_hints drop constraint if exists daily_hints_user_id_hint_date_shop_id_key;
alter table public.daily_hints drop constraint if exists daily_hints_user_day_gen_slot_key;
alter table public.daily_hints drop constraint if exists daily_hints_user_day_gen_shop_key;
alter table public.daily_hints
  add constraint daily_hints_user_day_gen_slot_key unique (user_id, hint_date, generation, slot);
alter table public.daily_hints
  add constraint daily_hints_user_day_gen_shop_key unique (user_id, hint_date, generation, shop_id);

-- -----------------------------------------------------------------------------
-- 2. create_daily_hints
--   p_rows: [{ "slot": 1, "shop_id": "hp:…", "hint_genre": …, "hint_catch": …, "hint_budget": …, "is_mystery": false }, …]
--   戻り値: 今の組（その日の一番大きい generation）の行を slot 順。
--   エラー: profile_missing（23503）、no_hints・regen_used・regen_done（P0001）。Edge Function が 409 にする。
-- -----------------------------------------------------------------------------
create or replace function public.create_daily_hints(
  p_user  uuid,
  p_day   date,
  p_regen boolean,
  p_rows  jsonb
)
returns setof public.daily_hints
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_gen smallint; -- その日の今の組（無ければ 0）
  v_new smallint; -- 書くときの generation（書かないなら NULL）
begin
  -- 本人の行を押さえて、同じ人の同時の要求を1つずつ通す。無ければ 0002 と同じ profile_missing
  perform 1 from public.profiles pr where pr.user_id = p_user for update;
  if not found then
    raise exception 'profile_missing' using errcode = '23503';
  end if;

  select coalesce(max(h.generation), 0) into v_gen
    from public.daily_hints h
   where h.user_id = p_user and h.hint_date = p_day;

  if not p_regen then
    -- まだ無ければ generation 1 で作る。あれば何も書かずに返す
    if v_gen = 0 then
      v_new := 1;
    end if;
  else
    if v_gen = 0 then
      raise exception 'no_hints' using errcode = 'P0001';
    end if;
    if v_gen >= 2 then
      raise exception 'regen_used' using errcode = 'P0001';
    end if;
    if exists (
      select 1 from public.daily_hints h
       where h.user_id = p_user and h.hint_date = p_day and h.generation = v_gen
         and h.completed_checkin_id is not null
    ) then
      raise exception 'regen_done' using errcode = 'P0001';
    end if;
    v_new := v_gen + 1;
  end if;

  -- 0件なら何も書かない（気配なしの日は行を作らない。作り直しなら回数を使わない）
  if v_new is not null and jsonb_array_length(coalesce(p_rows, '[]'::jsonb)) > 0 then
    insert into public.daily_hints
      (user_id, hint_date, generation, slot, shop_id, hint_genre, hint_catch, hint_budget, is_mystery)
    select p_user, p_day, v_new,
           (e ->> 'slot')::smallint,
           e ->> 'shop_id',
           e ->> 'hint_genre',
           e ->> 'hint_catch',
           e ->> 'hint_budget',
           coalesce((e ->> 'is_mystery')::boolean, false)
      from jsonb_array_elements(p_rows) as e;
    v_gen := v_new;
  end if;

  return query
    select h.* from public.daily_hints h
     where h.user_id = p_user and h.hint_date = p_day and h.generation = v_gen
     order by h.slot;
end;
$$;

revoke all on function public.create_daily_hints(uuid, date, boolean, jsonb)
  from public, anon, authenticated;
grant execute on function public.create_daily_hints(uuid, date, boolean, jsonb)
  to service_role;

-- -----------------------------------------------------------------------------
-- 3. perform_checkin の置き換え（0003 の動き＋気配の +10）
--   引数と戻り値の形が変わるので、古い関数を消してから作り直す
-- -----------------------------------------------------------------------------
drop function if exists public.perform_checkin(uuid, text, boolean, date, jsonb);
drop function if exists public.perform_checkin(uuid, text, boolean, date, jsonb, text);

create function public.perform_checkin(
  p_user        uuid,
  p_shop_id     text,
  p_far         boolean,
  p_day         date,
  p_cells       jsonb, -- [[x, y], ...] 整数の組の配列
  p_alt_shop_id text   -- 気配の照合にだけ使う「同じ店の別の id」（hp: と osm:）。無ければ NULL
)
returns table (checkin_id uuid, coins_awarded int, new_cells jsonb, was_hint boolean)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_id   uuid;
  v_gen  smallint;
  v_hint uuid; -- 今日の今の組の、未達成の気配の行（無ければ NULL）
begin
  -- プロフィールが無ければ外部キー違反（23503）で止める → Edge Function が 409 にする
  if not exists (select 1 from public.profiles pr where pr.user_id = p_user) then
    raise exception 'profile_missing' using errcode = '23503';
  end if;

  -- ★ 今日の気配を探す（一番大きい generation の組だけ。昨日・作り直す前の組は当たらない）
  select max(h.generation) into v_gen
    from public.daily_hints h
   where h.user_id = p_user and h.hint_date = p_day;
  if v_gen is not null then
    select h.hint_id into v_hint
      from public.daily_hints h
     where h.user_id = p_user and h.hint_date = p_day and h.generation = v_gen
       and h.shop_id in (p_shop_id, p_alt_shop_id)
       and h.completed_checkin_id is null
     order by h.slot
     limit 1
     for update;
  end if;

  -- 1. 同じお店のチェックインは1日1回（0003 のまま）。
  --    部分一意インデックス checkins_user_shop_reward_day_uniq に当たったら、今日はもう済み → 止める
  insert into public.checkins (user_id, shop_id, far_from_home, reward_day, was_hint)
  values (p_user, p_shop_id, p_far, p_day, v_hint is not null)
  on conflict (user_id, shop_id, reward_day) where reward_day is not null do nothing
  returning checkins.checkin_id into v_id;

  if v_id is null then
    raise exception 'already_today' using errcode = 'P0001';
  end if;

  -- 2. コイン 30。★ 気配なら hint_bonus 10 も（coin_ledger_checkin_reason_uniq で二重を防ぐ）
  insert into public.coin_ledger (user_id, reason, amount, checkin_id)
  values (p_user, 'checkin', 30, v_id);

  if v_hint is not null then
    insert into public.coin_ledger (user_id, reason, amount, checkin_id)
    values (p_user, 'hint_bonus', 10, v_id);

    -- ★ 気配の達成を記録
    update public.daily_hints h
       set completed_checkin_id = v_id
     where h.hint_id = v_hint;
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
  coins_awarded := case when v_hint is not null then 40 else 30 end;
  was_hint := v_hint is not null;
  return next;
end;
$$;

revoke execute on function public.perform_checkin(uuid, text, boolean, date, jsonb, text)
  from public, anon, authenticated;
grant execute on function public.perform_checkin(uuid, text, boolean, date, jsonb, text)
  to service_role;

commit;
