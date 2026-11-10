-- =============================================================================
-- もぐもGO マイグレーション 0006（週ミッション: 1週3つ・かんたん/ふつう/むずかしい・50/100/150 コイン）
--
-- 目的（設計 docs/superpowers/specs/2026-11-10-weekly-missions-design.md §2・§9）:
--   1. weekly_missions を「1週に3つ」にする（difficulty・family・reward を足し、一意を付けかえる）。
--   2. condition_type の種類を増やす。
--   3. coin_ledger の週ミッションの金額を 100 だけ → 50/100/150 にする。
--   4. create_weekly_missions: その週の3つを1回だけ作る。
--   5. settle_weekly_missions: 数えた進みを書く（下がらない）。届いたら達成とコインを1回だけ書く。
-- 呼び出し元: Edge Function `weekly-missions` だけ（service_role）。authenticated / anon には実行させない。
-- プライバシー: 座標・距離は受け取らない・保存しない（condition_params に入るのは種類の名前だけ）。
-- 適用: 0005 のあとに、Supabase SQL Editor に全体を貼って Run する（何度流しても同じ結果）。
--   今ある関数・表の動きは変えないので、流したあと置き直すものは無い（そのあと関数 weekly-missions を置く）。
--
-- -----------------------------------------------------------------------------
-- 流す前に（行が無いことの確認。あっても壊れないが、念のため）:
--   select count(*) from public.weekly_missions;   → 0 のはず
--
-- 手で確かめる（開発用 mogumo-go-dev の SQL Editor）。:u は自分の user_id に置きかえる。
--
--   -- 1. 作る: 2回呼んでも3行のまま
--   select mission_id, difficulty, reward from public.create_weekly_missions(:u, '2026-01-05',
--     '[{"difficulty":"easy","family":"hint","condition_type":"hint_shop","params":{"key":"hint_trail"},"target":1,"reward":50},
--       {"difficulty":"normal","family":"pioneer","condition_type":"first_visit","params":{"key":"kaitaku"},"target":3,"reward":100},
--       {"difficulty":"hard","family":"time","condition_type":"weekend","params":{"key":"weekend"},"target":3,"reward":150}]');
--   （同じ文をもう1回）→ 同じ3行
--   select count(*) from public.weekly_missions where user_id = :u and week_start = '2026-01-05';   → 3
--
--   -- 2. 進める: 下がらない・届いたら1回だけコイン
--   select * from public.settle_weekly_missions(:u, '2026-01-05', '[{"mission_id":"<easy の id>","progress":1}]');
--     → easy の newly_completed が true
--   （同じ文をもう1回）→ newly_completed は false
--   select * from public.settle_weekly_missions(:u, '2026-01-05', '[{"mission_id":"<normal の id>","progress":2}]');
--   select * from public.settle_weekly_missions(:u, '2026-01-05', '[{"mission_id":"<normal の id>","progress":1}]');
--     → normal の progress は 2 のまま
--   select reason, amount from public.coin_ledger where user_id = :u and weekly_mission_id is not null;   → weekly_mission 50 の1行
--
--   -- 3. authenticated から実行できない
--   select has_function_privilege('authenticated', 'public.settle_weekly_missions(uuid, date, jsonb)', 'execute');   → false
--   select has_function_privilege('authenticated', 'public.create_weekly_missions(uuid, date, jsonb)', 'execute');   → false
--
--   後片付け（coin_ledger は外部キーで一緒に消える）:
--   delete from public.weekly_missions where user_id = :u and week_start = '2026-01-05';
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1. weekly_missions: むずかしさ・系・ごほうび
-- -----------------------------------------------------------------------------
alter table public.weekly_missions add column if not exists difficulty text not null default 'normal';
alter table public.weekly_missions add column if not exists family text not null default 'other';
alter table public.weekly_missions add column if not exists reward smallint not null default 100;

-- もしも古い行があれば、系を種類から埋める（無ければ何もしない）
update public.weekly_missions set family = case condition_type
    when 'genre' then 'genre' when 'first_visit' then 'pioneer' when 'far_from_home' then 'far'
    when 'hint_shop' then 'hint' when 'same_town' then 'town' else 'other' end
  where family = 'other';

-- 1週1件の一意を外し、「むずかしさごとに1つ」「同じ系は重ねない」にする
alter table public.weekly_missions drop constraint if exists weekly_missions_user_id_week_start_key;
alter table public.weekly_missions drop constraint if exists weekly_missions_user_week_difficulty_key;
alter table public.weekly_missions add constraint weekly_missions_user_week_difficulty_key unique (user_id, week_start, difficulty);
alter table public.weekly_missions drop constraint if exists weekly_missions_user_week_family_key;
alter table public.weekly_missions add constraint weekly_missions_user_week_family_key unique (user_id, week_start, family);

alter table public.weekly_missions drop constraint if exists weekly_missions_difficulty_check;
alter table public.weekly_missions add constraint weekly_missions_difficulty_check check (difficulty in ('easy', 'normal', 'hard'));
alter table public.weekly_missions drop constraint if exists weekly_missions_reward_check;
alter table public.weekly_missions add constraint weekly_missions_reward_check
  check ((difficulty = 'easy' and reward = 50) or (difficulty = 'normal' and reward = 100) or (difficulty = 'hard' and reward = 150));

alter table public.weekly_missions drop constraint if exists weekly_missions_condition_type_check;
alter table public.weekly_missions add constraint weekly_missions_condition_type_check
  check (condition_type in ('hint_shop', 'first_visit', 'genre', 'revisit', 'far_from_home', 'distinct_kinds',
                            'lunch', 'fog_cells', 'active_days', 'hashigo_days', 'weekend', 'same_town'));

-- -----------------------------------------------------------------------------
-- 2. coin_ledger: 週ミッションの金額を 50 / 100 / 150 に
--   0001 の金額の check は名前が無い（自動の名前）ので、中身で探して外す
-- -----------------------------------------------------------------------------
do $$
declare
  c record;
begin
  for c in
    select conname from pg_constraint
     where conrelid = 'public.coin_ledger'::regclass and contype = 'c'
       and pg_get_constraintdef(oid) like '%weekly_mission%' and pg_get_constraintdef(oid) like '%amount%'
  loop
    execute format('alter table public.coin_ledger drop constraint %I', c.conname);
  end loop;
end $$;

alter table public.coin_ledger add constraint coin_ledger_amount_check check (
     (reason = 'checkin'        and amount = 30)
  or (reason = 'hint_bonus'     and amount = 10)
  or (reason = 'weekly_mission' and amount in (50, 100, 150))
  or (reason = 'town_conquest'  and amount = 100)
  or (reason = 'gacha'          and amount < 0)
);

-- -----------------------------------------------------------------------------
-- 3. create_weekly_missions: その週の行が無ければ p_rows（3つ）を入れる。あれば何も書かない。その週の行を返す
--   p_rows: [{ difficulty, family, condition_type, params, target, reward }, …]
-- -----------------------------------------------------------------------------
create or replace function public.create_weekly_missions(p_user uuid, p_week date, p_rows jsonb)
returns setof public.weekly_missions
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- 本人の行を押さえて、同じ人の同時の呼び出しを1つずつ通す
  perform 1 from public.profiles pr where pr.user_id = p_user for update;
  if not found then
    raise exception 'profile_missing' using errcode = '23503';
  end if;

  if not exists (select 1 from public.weekly_missions w where w.user_id = p_user and w.week_start = p_week) then
    insert into public.weekly_missions (user_id, week_start, difficulty, family, condition_type, condition_params, target, reward)
    select p_user, p_week, r->>'difficulty', r->>'family', r->>'condition_type',
           coalesce(r->'params', '{}'::jsonb), (r->>'target')::smallint, (r->>'reward')::smallint
      from jsonb_array_elements(p_rows) r;
  end if;

  return query
    select w.* from public.weekly_missions w
     where w.user_id = p_user and w.week_start = p_week
     order by case w.difficulty when 'easy' then 0 when 'normal' then 1 else 2 end;
end;
$$;

-- -----------------------------------------------------------------------------
-- 4. settle_weekly_missions: 進みを書く（下がらない・目標で止まる）。届いたら達成とコイン（1回だけ）
--   p_progress: [{ mission_id, progress }, …]（Edge Function が自分の記録から数えた値）
--   返す: その週の行と、今回はじめて達成したか
-- -----------------------------------------------------------------------------
create or replace function public.settle_weekly_missions(p_user uuid, p_week date, p_progress jsonb)
returns table (mission_id uuid, progress smallint, completed_at timestamptz, newly_completed boolean)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  r      jsonb;
  m      public.weekly_missions%rowtype;
  v_next smallint;
  v_new  uuid[] := '{}';
begin
  for r in select * from jsonb_array_elements(coalesce(p_progress, '[]'::jsonb)) loop
    select * into m from public.weekly_missions w
     where w.mission_id = (r->>'mission_id')::uuid and w.user_id = p_user and w.week_start = p_week
     for update;
    if not found then
      continue; -- 他人の行・別の週の行は触らない
    end if;
    v_next := least(m.target, greatest(m.progress, coalesce((r->>'progress')::int, 0)))::smallint;
    if v_next = m.progress then
      continue;
    end if;
    if v_next = m.target and m.completed_at is null then
      update public.weekly_missions w set progress = v_next, completed_at = now() where w.mission_id = m.mission_id;
      insert into public.coin_ledger (user_id, reason, amount, weekly_mission_id)
      values (p_user, 'weekly_mission', m.reward, m.mission_id)
      on conflict do nothing;
      v_new := v_new || m.mission_id;
    else
      update public.weekly_missions w set progress = v_next where w.mission_id = m.mission_id;
    end if;
  end loop;

  return query
    select w.mission_id, w.progress, w.completed_at, w.mission_id = any (v_new)
      from public.weekly_missions w
     where w.user_id = p_user and w.week_start = p_week
     order by case w.difficulty when 'easy' then 0 when 'normal' then 1 else 2 end;
end;
$$;

-- -----------------------------------------------------------------------------
-- 5. 権限: service_role だけ
-- -----------------------------------------------------------------------------
revoke all on function public.create_weekly_missions(uuid, date, jsonb) from public, anon, authenticated;
grant execute on function public.create_weekly_missions(uuid, date, jsonb) to service_role;
revoke all on function public.settle_weekly_missions(uuid, date, jsonb) from public, anon, authenticated;
grant execute on function public.settle_weekly_missions(uuid, date, jsonb) to service_role;

commit;
