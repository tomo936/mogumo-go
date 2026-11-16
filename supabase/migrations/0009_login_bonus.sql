-- =============================================================================
-- もぐもGO マイグレーション 0009（ログインボーナス: 7 日で 1 周のスタンプカード）
--
-- 決まり（SPEC A4・設計 docs/superpowers/specs/2026-11-17-login-bonus-design.md）:
--   - 日本時間の 1 日に 1 回だけ受け取れる。スタンプは 1〜7 個目。1〜6 個目は 10 コイン、7 個目は 50 コイン。
--   - 休んでもスタンプは消えない（受け取った日数で進む）。7 個そろったら、次に受け取った日から新しいカード（1 個目）。
--   - コインは coin_ledger に reason = 'login_bonus' で書く。受け取りの記録（login_bonus_claims）と同じトランザクション。
-- 呼び出し元: アプリ（ログイン中の本人）。関数は auth.uid() だけを見るので、ほかの人の分は受け取れない。
--   coin_ledger への書き込みはこの関数（security definer）の中だけ。表への直接の書き込みは誰にも許さない。
-- 適用: 0008 のあとに、Supabase SQL Editor に全体を貼って Run する（何度流しても同じ結果）。
--
-- -----------------------------------------------------------------------------
-- 手で確かめる（開発用 mogumo-go-dev の SQL Editor。:u は自分の user_id）。
--   SQL Editor は auth.uid() が空なので、次の 1 行を先に流して「ログイン中」にしてから呼ぶ:
--     select set_config('request.jwt.claims', json_build_object('sub', ':u', 'role', 'authenticated')::text, false);
--   1. select * from public.claim_login_bonus();        → stamp_no 1, coins_awarded 10, claimed_now true
--   2. もう 1 回                                           → stamp_no 1, coins_awarded 0, claimed_now false（同じ日）
--   3. select * from public.login_bonus_state();         → total 1, claimed_today true
--   4. 日付を進めて確かめる（開発用だけ）:
--        update public.login_bonus_claims set claim_day = claim_day - 1 where user_id = ':u';
--        → また claim_login_bonus() で stamp_no 2。これを 7 回目まで繰り返すと stamp_no 7 / coins_awarded 50、8 回目は stamp_no 1。
--   5. select reason, amount from public.coin_ledger where user_id = ':u' and reason = 'login_bonus';
--   6. authenticated から表に直接書けない:
--        select has_table_privilege('authenticated', 'public.login_bonus_claims', 'insert');   → false
--   後片付け: delete from public.coin_ledger where user_id = ':u' and reason = 'login_bonus';
--            delete from public.login_bonus_claims where user_id = ':u';
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. coin_ledger に 'login_bonus' を足す（理由の check と金額の check を付けかえる）
--   0001 の理由の check は名前が無い（自動の名前）ので、中身で探して外す
--   （参照列の check も理由の一覧を持つので、checkin_id を含むものは外さない）
-- -----------------------------------------------------------------------------
do $$
declare
  c record;
begin
  for c in
    select conname from pg_constraint
     where conrelid = 'public.coin_ledger'::regclass and contype = 'c'
       and pg_get_constraintdef(oid) like '%town_conquest%'
       and pg_get_constraintdef(oid) like '%ARRAY%'
       and pg_get_constraintdef(oid) not like '%checkin_id%'
       and pg_get_constraintdef(oid) not like '%amount%'
  loop
    execute format('alter table public.coin_ledger drop constraint %I', c.conname);
  end loop;
end $$;

alter table public.coin_ledger drop constraint if exists coin_ledger_reason_check;
alter table public.coin_ledger add constraint coin_ledger_reason_check
  check (reason in ('checkin', 'hint_bonus', 'weekly_mission', 'town_conquest', 'gacha', 'login_bonus'));

alter table public.coin_ledger drop constraint if exists coin_ledger_amount_check;
alter table public.coin_ledger add constraint coin_ledger_amount_check check (
     (reason = 'checkin'        and amount = 30)
  or (reason = 'hint_bonus'     and amount = 10)
  or (reason = 'weekly_mission' and amount in (50, 100, 150))
  or (reason = 'town_conquest'  and amount = 100)
  or (reason = 'gacha'          and amount < 0)
  or (reason = 'login_bonus'    and amount in (10, 50))
);

-- -----------------------------------------------------------------------------
-- 2. 受け取りの記録（1 日 1 行）
-- -----------------------------------------------------------------------------
create table if not exists public.login_bonus_claims (
  user_id    uuid        not null references public.profiles (user_id) on delete cascade,
  claim_day  date        not null, -- 日本時間の日付
  stamp_no   integer     not null check (stamp_no between 1 and 7),
  coins      integer     not null check (coins in (10, 50)),
  created_at timestamptz not null default now(),
  primary key (user_id, claim_day)
);

alter table public.login_bonus_claims enable row level security;

drop policy if exists login_bonus_claims_select_own on public.login_bonus_claims;
create policy login_bonus_claims_select_own
  on public.login_bonus_claims for select
  to authenticated
  using ((select auth.uid()) = user_id);

revoke all on table public.login_bonus_claims from public, anon, authenticated, service_role;
grant select on table public.login_bonus_claims to authenticated;
grant select, insert, update, delete on table public.login_bonus_claims to service_role;

-- -----------------------------------------------------------------------------
-- 3. claim_login_bonus: 今日（日本時間）の分を、まだなら受け取る。コインとスタンプを 1 回だけ書く
--   返す: stamp_no = 今日のスタンプの番号（1〜7）、coins_awarded = 今回もらった枚数（受け取り済みは 0）、claimed_now = 今回受け取ったか
-- -----------------------------------------------------------------------------
create or replace function public.claim_login_bonus()
returns table (stamp_no integer, coins_awarded integer, claimed_now boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user  uuid := (select auth.uid());
  v_day   date := (now() at time zone 'Asia/Tokyo')::date;
  v_total integer;
  v_stamp integer;
  v_coins integer;
begin
  if v_user is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  -- 同じ人の同時の呼び出しを 1 つずつにする
  perform pg_advisory_xact_lock(hashtextextended('login_bonus:' || v_user::text, 0));

  select c.stamp_no, 0, false into stamp_no, coins_awarded, claimed_now
    from public.login_bonus_claims c
   where c.user_id = v_user and c.claim_day = v_day;
  if found then
    return next;
    return;
  end if;

  select count(*) into v_total from public.login_bonus_claims where user_id = v_user;
  v_stamp := (v_total % 7) + 1;
  v_coins := case when v_stamp = 7 then 50 else 10 end;

  insert into public.login_bonus_claims (user_id, claim_day, stamp_no, coins)
  values (v_user, v_day, v_stamp, v_coins);
  insert into public.coin_ledger (user_id, reason, amount)
  values (v_user, 'login_bonus', v_coins);

  stamp_no := v_stamp;
  coins_awarded := v_coins;
  claimed_now := true;
  return next;
end;
$$;

-- -----------------------------------------------------------------------------
-- 4. login_bonus_state: 今のカードの様子（受け取らずに読むだけ）
--   total = これまでに受け取った日数、claimed_today = 今日（日本時間）はもう受け取ったか
-- -----------------------------------------------------------------------------
create or replace function public.login_bonus_state()
returns table (total integer, claimed_today boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer,
         coalesce(bool_or(c.claim_day = (now() at time zone 'Asia/Tokyo')::date), false)
    from public.login_bonus_claims c
   where c.user_id = (select auth.uid());
$$;

revoke all on function public.claim_login_bonus() from public, anon;
grant execute on function public.claim_login_bonus() to authenticated, service_role;
revoke all on function public.login_bonus_state() from public, anon;
grant execute on function public.login_bonus_state() to authenticated, service_role;
