-- =============================================================================
-- 0014 ガチャ（A15）。設計: docs/superpowers/specs/2026-11-17-gacha-design.md
--   表は 0001 で作ってある（characters・gacha_sessions・gacha_draws・user_characters・coin_ledger の 'gacha'）。
--   0001 では「書き込みは Edge Functions のみ」だったが、0014 からは下の SQL 関数（security definer）が書く。
--   抽選・引き落とし・持ち物・なかよし度は draw_gacha が 1 つのトランザクションで決める（端末では決めない）。
-- =============================================================================
begin;

-- -----------------------------------------------------------------------------
-- 1. いまガチャに入っているキャラ（最初は 3D がある 5 体だけ）と名前
--    入れる・外すは運営が Table Editor で in_pool を書き換える
-- -----------------------------------------------------------------------------
alter table public.characters add column if not exists in_pool boolean not null default false;

update public.characters c
   set name = v.name
  from (values
    (1, '星降るキリン'), (2, '月うさぎ'), (3, '虹ペガサス'), (4, '天使'),
    (5, 'いちごミルクねこ'), (6, 'プリンしば'), (7, 'わたあめアルパカ'), (8, 'パフェうさぎ'),
    (9, 'チーズねずみ'), (10, 'メロンパンかめ'), (11, 'シュークリームひよこ'), (12, 'たいやき金魚'),
    (13, 'ドーナツりす'), (14, 'クッキーくま'), (15, 'マカロンももんが'), (16, 'カップケーキひつじ'),
    (17, 'クレープはりねずみ'), (18, 'パンケーキコアラ'), (19, 'かき氷しろくま'), (20, 'クリームソーダペンギン'),
    (21, '抹茶かえる'), (22, 'あんみつたぬき'), (23, 'カステラ子ねこ'), (24, 'ゼリーくらげ'),
    (25, 'キャンディハムスター'), (26, 'みたらし団子うさぎ'), (27, 'コーヒーふくろう'), (28, 'みつばち'),
    (29, 'ポップコーンきつね'), (30, 'ゆずねこ'),
    (101, '男の子'), (102, '女の子')
  ) as v(id, name)
 where c.character_id = v.id;

update public.characters set in_pool = true where character_id in (1, 5, 6, 14, 26);

-- -----------------------------------------------------------------------------
-- 2. いま使っているキャラ（空なら最初のキャラ starter_character_id）
--    書き換えは set_character だけ（列の grant はしない）
-- -----------------------------------------------------------------------------
alter table public.profiles add column if not exists current_character_id smallint null
  references public.characters (character_id) on delete set null;

-- -----------------------------------------------------------------------------
-- 3. draw_gacha: 引く（'single' 100 コイン／'ten' 1000 コイン）
--   返す: 1 体ごとに 1 行（status = 'ok'）。コインが足りなければ 1 行だけ status = 'insufficient'（他は null）
--   決まり（SPEC A15）:
--     ★3 70%／★4 25%／★5 5%。★を決めてから、その★の in_pool のキャラから等しく選ぶ
--     天井: 前の ★5（無ければ最初）から数えて 30 回目は ★5
--     10 連: 1〜9 体目に ★4 以上が無ければ、10 体目は ★4 以上（★5 は 5/30、★4 は 25/30）
--     guarantee の印は ceiling ＞ ten_floor ＞ none
--   なかよし度 = user_characters.duplicate_count（ダブるたびに +1。見せるのは 5 まで、数は数え続ける）
-- -----------------------------------------------------------------------------
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
declare
  v_user     uuid := (select auth.uid());
  v_count    integer;
  v_cost     integer;
  v_balance  bigint;
  v_session  uuid;
  v_pull_no  integer;
  v_last5    integer;
  v_hi_seen  boolean := false; -- この 10 連で ★4 以上が出たか
  v_rarity   smallint;
  v_mark     text;
  v_char     smallint;
  v_dup      integer;
  v_new      boolean;
  v_roll     double precision;
  i          integer;
begin
  if v_user is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if p_type = 'single' then
    v_count := 1; v_cost := 100;
  elsif p_type = 'ten' then
    v_count := 10; v_cost := 1000;
  else
    raise exception 'bad_type' using errcode = '22023';
  end if;

  -- 同じ人の同時の呼び出しを 1 つずつにする（二重の引き落とし・天井の二重取りを防ぐ）
  perform pg_advisory_xact_lock(hashtextextended('gacha:' || v_user::text, 0));

  select coalesce(sum(l.amount), 0) into v_balance from public.coin_ledger l where l.user_id = v_user;
  if v_balance < v_cost then
    pos := null; character_id := null; rarity := null; guarantee := null; is_new := null; friendship := null;
    status := 'insufficient';
    return next;
    return;
  end if;

  insert into public.gacha_sessions (user_id, draw_type, cost)
  values (v_user, p_type, v_cost)
  returning session_id into v_session;

  insert into public.coin_ledger (user_id, reason, amount, gacha_session_id)
  values (v_user, 'gacha', -v_cost, v_session);

  select coalesce(max(d.user_pull_no), 0) into v_pull_no from public.gacha_draws d where d.user_id = v_user;
  select coalesce(max(d.user_pull_no), 0) into v_last5 from public.gacha_draws d where d.user_id = v_user and d.rarity = 5;

  for i in 1..v_count loop
    v_pull_no := v_pull_no + 1;
    v_mark := 'none';
    if v_pull_no - v_last5 >= 30 then
      v_rarity := 5; v_mark := 'ceiling';
    elsif v_count = 10 and i = 10 and not v_hi_seen then
      v_mark := 'ten_floor';
      v_rarity := case when random() < 5.0 / 30.0 then 5 else 4 end;
    else
      v_roll := random();
      v_rarity := case when v_roll < 0.05 then 5 when v_roll < 0.30 then 4 else 3 end;
    end if;
    if v_rarity >= 4 then v_hi_seen := true; end if;
    if v_rarity = 5 then v_last5 := v_pull_no; end if;

    select c.character_id into v_char
      from public.characters c
     where c.pool = 'gacha' and c.in_pool and c.rarity = v_rarity
     order by random()
     limit 1;
    if v_char is null then
      raise exception 'empty_pool_rarity_%', v_rarity using errcode = 'P0001';
    end if;

    insert into public.gacha_draws (session_id, user_id, position, user_pull_no, character_id, rarity, guarantee)
    values (v_session, v_user, i, v_pull_no, v_char, v_rarity, v_mark);

    insert into public.user_characters as uc (user_id, character_id)
    values (v_user, v_char)
    -- 戻り値の列名 character_id と紛れないよう、制約の名前で指す
    on conflict on constraint user_characters_pkey do update set duplicate_count = uc.duplicate_count + 1
    returning uc.duplicate_count, (uc.xmax = 0) into v_dup, v_new;

    pos := i; character_id := v_char; rarity := v_rarity; guarantee := v_mark;
    is_new := v_new; friendship := v_dup; status := 'ok';
    return next;
  end loop;
end;
$$;

-- -----------------------------------------------------------------------------
-- 4. set_character: 使うキャラを変える（持っているキャラか、最初の 2 人だけ）
-- -----------------------------------------------------------------------------
create or replace function public.set_character(p_character_id smallint)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
begin
  if v_user is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if p_character_id not in (101, 102)
     and not exists (select 1 from public.user_characters u where u.user_id = v_user and u.character_id = p_character_id) then
    return 'not_owned';
  end if;
  update public.profiles set current_character_id = p_character_id where user_id = v_user;
  return 'ok';
end;
$$;

-- -----------------------------------------------------------------------------
-- 5. my_gacha_state: 前の ★5 の後に引いた回数（天井まであと何回の計算用）と、使っているキャラ
-- -----------------------------------------------------------------------------
create or replace function public.my_gacha_state()
returns table (pulls_since_five integer, current_character_id smallint)
language sql
stable
security definer
set search_path = ''
as $$
  select
    coalesce((select max(d.user_pull_no) from public.gacha_draws d where d.user_id = (select auth.uid())), 0)
      - coalesce((select max(d.user_pull_no) from public.gacha_draws d where d.user_id = (select auth.uid()) and d.rarity = 5), 0),
    (select p.current_character_id from public.profiles p where p.user_id = (select auth.uid()));
$$;

-- -----------------------------------------------------------------------------
-- 6. my_characters: 持っているキャラ（なかよし度つき）
-- -----------------------------------------------------------------------------
create or replace function public.my_characters()
returns table (character_id smallint, duplicate_count integer, obtained_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select u.character_id, u.duplicate_count, u.obtained_at
    from public.user_characters u
   where u.user_id = (select auth.uid())
   order by u.character_id;
$$;

revoke all on function public.draw_gacha(text) from public, anon;
grant execute on function public.draw_gacha(text) to authenticated, service_role;
revoke all on function public.set_character(smallint) from public, anon;
grant execute on function public.set_character(smallint) to authenticated, service_role;
revoke all on function public.my_gacha_state() from public, anon;
grant execute on function public.my_gacha_state() to authenticated, service_role;
revoke all on function public.my_characters() from public, anon;
grant execute on function public.my_characters() to authenticated, service_role;

commit;
