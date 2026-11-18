-- =============================================================================
-- もぐもGO マイグレーション 0005（町のクリア・コンプリート）
--
-- 目的（設計 docs/superpowers/specs/2026-11-10-towns-design.md §5.2）:
--   1. towns に、市区町村名・面積・その町のお店の一覧（地図のお店）・数えた時刻・数えている途中の続き を足す。
--      行は「誰かが行った町だけ」。Edge Function `towns` が初めてのときに入れる。
--   2. shops に town_checked_at（その店の町を調べた時刻）を足す。
--      町が見つからなかった店（海の上・データの外）をくり返し調べないための印。
--   3. town_conquests に completed_at（コンプリートの時刻）を足す。conquered_at がクリアの時刻。
--   4. grant_town: クリアの行とコイン 100 を1つのトランザクションで書く。二重には付かない。
-- 呼び出し元:
--   Edge Function `towns` だけ（service_role）。authenticated / anon には実行させない。
-- プライバシー:
--   現在地・自宅は受け取らない・保存しない。towns.shops は地図（OpenStreetMap）のお店の一覧で、人の情報は入らない。
--   fog_cells に町のセルは入れない（アプリが町の形から、見えている範囲だけ計算する）。
-- 適用: 0004 のあとに、Supabase SQL Editor に全体を貼って Run する（何度流しても同じ結果）。
--   今ある関数・表の動きは変えないので、流したあと置き直すものは無い。
--
-- -----------------------------------------------------------------------------
-- 手で確かめる（開発用 mogumo-go-dev の SQL Editor）。:u は自分の user_id に置きかえる。
--
--   -- 0. 試し用の町を1つ入れる
--   insert into public.towns (town_id, name, city_name, area_m2, boundary, min_lat, max_lat, min_lng, max_lng)
--   values ('99999-ためし', 'ためし', 'ためし市', 10000,
--           '{"type":"Polygon","coordinates":[[[139,35],[139.001,35],[139.001,35.001],[139,35.001],[139,35]]]}',
--           35, 35.001, 139, 139.001)
--   on conflict do nothing;
--
--   -- 1. どちらも false なら何も書かない
--   select * from public.grant_town(:u, '99999-ためし', false, false);   → false, false
--   select count(*) from public.town_conquests where user_id = :u and town_id = '99999-ためし';   → 0
--
--   -- 2. クリア: 1回目だけ newly_cleared が true。コインは1行だけ
--   select * from public.grant_town(:u, '99999-ためし', true, false);    → true, false
--   select * from public.grant_town(:u, '99999-ためし', true, false);    → false, false
--   select count(*) from public.coin_ledger where user_id = :u and town_id = '99999-ためし';      → 1（100）
--
--   -- 3. あとからコンプリート: completed_at が入り、コインは増えない
--   select * from public.grant_town(:u, '99999-ためし', true, true);     → false, true
--   select * from public.grant_town(:u, '99999-ためし', true, true);     → false, false
--   select conquered_at, completed_at from public.town_conquests where user_id = :u and town_id = '99999-ためし';
--   select count(*) from public.coin_ledger where user_id = :u and town_id = '99999-ためし';      → 1 のまま
--
--   -- 4. authenticated から実行できない
--   select has_function_privilege('authenticated', 'public.grant_town(uuid, text, boolean, boolean)', 'execute');
--   → false（anon も同じ）。service_role は true
--
--   後片付け:
--   delete from public.coin_ledger where user_id = :u and town_id = '99999-ためし';
--   delete from public.town_conquests where user_id = :u and town_id = '99999-ためし';
--   delete from public.towns where town_id = '99999-ためし';
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1. towns: 市区町村名・面積・お店の一覧・数えた時刻・途中の続き
--   shops:       [{ "id": "osm:…", "name": "…", "lat": 35.6, "lng": 139.6 }, …]（数え終わるまで NULL）
--   count_state: { "tiles": [[x, y], …], "next": 0, "shops": […] }（数えている途中だけ。終われば NULL）
-- -----------------------------------------------------------------------------
alter table public.towns
  add column if not exists city_name   text             null,
  add column if not exists area_m2     double precision null,
  add column if not exists shops       jsonb            null,
  add column if not exists counted_at  timestamptz      null,
  add column if not exists count_state jsonb            null;

-- -----------------------------------------------------------------------------
-- 2. shops: 町を調べた時刻（town_id が NULL でこれが入っていれば「町なし」と分かっている店）
-- -----------------------------------------------------------------------------
alter table public.shops
  add column if not exists town_checked_at timestamptz null;

-- -----------------------------------------------------------------------------
-- 3. town_conquests: コンプリートの時刻
-- -----------------------------------------------------------------------------
alter table public.town_conquests
  add column if not exists completed_at timestamptz null;

-- -----------------------------------------------------------------------------
-- 4. grant_town
--   p_clear / p_complete: Edge Function が今の進み具合から判定した結果。
--   戻り値: 今回の呼び出しで新しく付いたものだけ true（アプリの「クリア！」の帯に使う）。
--   コンプリートはクリアを含む（全部行っていれば半分以上）ので、p_complete だけ真でもクリアの行とコインを書く。
--   一度付いたクリア・コンプリートは、あとで false で呼ばれても消さない。
--   エラー: profile_missing（23503）。町の行が無ければ外部キー違反（23503）。
-- -----------------------------------------------------------------------------
create or replace function public.grant_town(
  p_user     uuid,
  p_town     text,
  p_clear    boolean,
  p_complete boolean
)
returns table (newly_cleared boolean, newly_completed boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rows int;
begin
  newly_cleared := false;
  newly_completed := false;

  if not (coalesce(p_clear, false) or coalesce(p_complete, false)) then
    return next;
    return;
  end if;

  if not exists (select 1 from public.profiles pr where pr.user_id = p_user) then
    raise exception 'profile_missing' using errcode = '23503';
  end if;

  -- クリアの行。すでにあれば何もしない（同時に2回呼ばれても、片方だけが入る）
  insert into public.town_conquests (user_id, town_id)
  values (p_user, p_town)
  on conflict (user_id, town_id) do nothing;
  get diagnostics v_rows = row_count;

  if v_rows > 0 then
    -- コイン 100。町ごとに1回（coin_ledger_user_town_uniq で二重を防ぐ）
    insert into public.coin_ledger (user_id, reason, amount, town_id)
    values (p_user, 'town_conquest', 100, p_town)
    on conflict (user_id, town_id) where town_id is not null do nothing;
    newly_cleared := true;
  end if;

  if coalesce(p_complete, false) then
    update public.town_conquests c
       set completed_at = now()
     where c.user_id = p_user and c.town_id = p_town and c.completed_at is null;
    get diagnostics v_rows = row_count;
    newly_completed := v_rows > 0;
  end if;

  return next;
end;
$$;

revoke all on function public.grant_town(uuid, text, boolean, boolean)
  from public, anon, authenticated;
grant execute on function public.grant_town(uuid, text, boolean, boolean)
  to service_role;

commit;
