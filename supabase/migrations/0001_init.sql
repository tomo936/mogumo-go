-- =============================================================================
-- もぐもGO 初期マイグレーション（0001_init.sql）
--
-- 目的:
--   Cycle 1 で使う DB 一式（18テーブル、ビュー2つ、updated_at トリガー、
--   インデックス、CHECK、外部キー、RLS ポリシー、GRANT、Storage の bucket と
--   ポリシー、characters の初期データ）を作る。
-- 正本:
--   docs/detailed-design-db.md（DB の詳細設計）。設計に無いテーブル・列・機能は入れていない。
-- 適用方法:
--   docs/sql-apply-guide.md を参照。Supabase SQL Editor（postgres ロール）に
--   ファイル全体を貼り付けて1回 Run する。全体が1トランザクションなので、
--   途中でエラーになった場合は何も適用されない。初回適用専用（冪等ではない）。
-- 前提:
--   プロジェクトは auto-expose（API への自動公開）OFF。権限はこのファイルの
--   GRANT に書いたものだけを付ける。anon ロールには何も付けない。
--
-- 【重要】自宅座標はどこにも持たない。
--   どのテーブル・ビュー・Storage にも、自宅の座標・自宅の概略位置・
--   自宅からの距離・自宅を基準にした値の列を作らない（設計 2.5 / 3.19）。
--   自宅の座標は端末内だけに保存する。
--
-- 補足:
--   - PostGIS は使わない（設計 D-08）。緯度経度は double precision。
--   - 列挙値は enum 型を使わず text + CHECK（設計 2.1）。
--   - 改ざん防止が要るテーブルは Edge Functions（service_role）だけが書く。
--   - 設計 4.4 の app_apply_checkin / app_apply_gacha は「名前は仮、引数・戻り値は
--     Edge Functions の詳細設計で決める」とされているため、このファイルには含めない。
--     決まったら別の migration で追加する。
-- =============================================================================

begin;

-- public スキーマの USAGE（設計 2.4 の確認事項。既に付いていれば何も変わらない）
grant usage on schema public to authenticated, service_role;


-- =============================================================================
-- 共通: updated_at を更新するトリガー関数（設計 4.3）
-- =============================================================================
create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

revoke execute on function public.set_updated_at() from public, anon, authenticated;


-- =============================================================================
-- 3.1 characters（キャラマスタ）
--   ガチャ候補 1〜30 と初回キャラ（101・102）。書き込みは migration / 管理画面のみ。
-- =============================================================================
create table public.characters (
  character_id smallint    not null primary key check (character_id > 0),
  pool         text        not null check (pool in ('starter', 'gacha')),
  rarity       smallint    null check (rarity between 3 and 5),
  name         text        null check (name is null or btrim(name) <> ''),
  sprite_path  text        null,
  created_at   timestamptz not null default now(),
  check ((pool = 'gacha') = (rarity is not null)),
  -- gacha_draws の複合外部キー用
  unique (character_id, rarity),
  -- profiles の複合外部キー用
  unique (character_id, pool)
);

alter table public.characters enable row level security;

create policy characters_select_authenticated
  on public.characters for select
  to authenticated
  using (true);

revoke all on table public.characters from public, anon, authenticated, service_role;
grant select on table public.characters to authenticated;
grant select, insert, update, delete on table public.characters to service_role;


-- =============================================================================
-- 3.2 profiles（ニックネームと初回設定）
--   本人のみ読み書き。他人には public_profiles ビュー経由で nickname だけ見せる。
--   自宅座標の列は作らない。
-- =============================================================================
create table public.profiles (
  user_id              uuid        not null default auth.uid() primary key
                         references auth.users (id) on delete cascade,
  nickname             text        not null
                         check (char_length(nickname) between 1 and 10)
                         check (btrim(nickname) <> ''),
  starter_character_id smallint    not null,
  starter_pool         text        not null default 'starter'
                         check (starter_pool = 'starter'),
  record_started_at    timestamptz not null default now(),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  foreign key (starter_character_id, starter_pool)
    references public.characters (character_id, pool) on delete restrict
);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;

create policy profiles_select_own
  on public.profiles for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy profiles_insert_own
  on public.profiles for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy profiles_update_own
  on public.profiles for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

revoke all on table public.profiles from public, anon, authenticated, service_role;
grant select on table public.profiles to authenticated;
grant insert (nickname, starter_character_id) on table public.profiles to authenticated;
grant update (nickname, starter_character_id) on table public.profiles to authenticated;
grant select, insert, update, delete on table public.profiles to service_role;


-- =============================================================================
-- 3.3 towns（町・丁目の区域）
--   区域の形は GeoJSON（jsonb）＋外接矩形。書き込みは取り込みスクリプト / service_role。
-- =============================================================================
create table public.towns (
  town_id    text             not null primary key,
  name       text             not null check (btrim(name) <> ''),
  boundary   jsonb            not null
               check (boundary->>'type' in ('Polygon', 'MultiPolygon')),
  min_lat    double precision not null check (min_lat between -90 and 90),
  max_lat    double precision not null check (max_lat between -90 and 90),
  min_lng    double precision not null check (min_lng between -180 and 180),
  max_lng    double precision not null check (max_lng between -180 and 180),
  created_at timestamptz      not null default now(),
  check (min_lat <= max_lat),
  check (min_lng <= max_lng)
);

create index towns_lat_range_idx on public.towns (min_lat, max_lat);

alter table public.towns enable row level security;

create policy towns_select_authenticated
  on public.towns for select
  to authenticated
  using (true);

revoke all on table public.towns from public, anon, authenticated, service_role;
grant select on table public.towns to authenticated;
grant select, insert, update, delete on table public.towns to service_role;


-- =============================================================================
-- 3.4 shops（ホットペッパー由来の店キャッシュ）
--   lat/lng は店の位置。誰がどこを中心に検索したかは残さない。
-- =============================================================================
create table public.shops (
  shop_id     text             not null primary key,
  name        text             not null check (btrim(name) <> ''),
  lat         double precision not null check (lat between -90 and 90),
  lng         double precision not null check (lng between -180 and 180),
  genre_code  text             null,
  genre_name  text             null,
  catch       text             null,
  budget_code text             null,
  budget_name text             null,
  photo_url   text             null,
  town_id     text             null
                references public.towns (town_id) on delete set null,
  fetched_at  timestamptz      not null default now()
);

create index shops_lat_lng_idx on public.shops (lat, lng);
create index shops_town_id_idx on public.shops (town_id);

alter table public.shops enable row level security;

create policy shops_select_authenticated
  on public.shops for select
  to authenticated
  using (true);

revoke all on table public.shops from public, anon, authenticated, service_role;
grant select on table public.shops to authenticated;
grant select, insert, update, delete on table public.shops to service_role;


-- =============================================================================
-- 3.5 checkins（チェックイン＝図鑑カードの元）
--   現在地・店からの距離の列は持たない。書き込みは Edge Functions のみ。
-- =============================================================================
create table public.checkins (
  checkin_id    uuid        not null default gen_random_uuid() primary key,
  user_id       uuid        not null
                  references public.profiles (user_id) on delete cascade,
  shop_id       text        not null
                  references public.shops (shop_id) on delete restrict,
  was_hint      boolean     not null default false,
  checked_in_at timestamptz not null default now(),
  -- コインを付けた日（D-15: 同じ店のコインは1日1回）。付けなかった再チェックインは NULL。
  -- 日の区切り（JST 何時か）は Edge Functions 側で決める（N-08 / D-19）。
  reward_day    date        null,
  -- 自宅から500m以上先だったか（週ミッション条件 far_from_home 用）。端末の申告。
  -- 距離や座標は受け取らず、真偽だけを保存する（D-16、決定 2026-11-05）。
  far_from_home boolean     not null default false,
  -- reviews の複合外部キー用
  unique (checkin_id, user_id, shop_id)
);

create index checkins_user_checked_in_at_idx on public.checkins (user_id, checked_in_at desc);
create index checkins_user_shop_idx on public.checkins (user_id, shop_id);
create index checkins_shop_id_idx on public.checkins (shop_id);
-- 同じ店でコインが付くのは1日1回まで（D-15）
create unique index checkins_user_shop_reward_day_uniq
  on public.checkins (user_id, shop_id, reward_day) where reward_day is not null;

alter table public.checkins enable row level security;

create policy checkins_select_own
  on public.checkins for select
  to authenticated
  using ((select auth.uid()) = user_id);

revoke all on table public.checkins from public, anon, authenticated, service_role;
grant select on table public.checkins to authenticated;
grant select, insert, update, delete on table public.checkins to service_role;


-- =============================================================================
-- 3.6 reviews（感想・星・写真）
--   1チェックインにつき1件。本人が作成・編集・削除。hidden は管理者だけが変える。
-- =============================================================================
create table public.reviews (
  review_id  uuid        not null default gen_random_uuid() primary key,
  user_id    uuid        not null default auth.uid()
               references public.profiles (user_id) on delete cascade,
  checkin_id uuid        not null unique,
  shop_id    text        not null
               references public.shops (shop_id) on delete restrict,
  stars      smallint    not null check (stars between 1 and 5),
  body       text        null
               check (body is null or char_length(body) between 1 and 500),
  photo_path text        null
               check (photo_path is null or photo_path like (user_id::text || '/%')),
  hidden     boolean     not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- 自分のチェックインで、かつ同じ店でないと作れない
  foreign key (checkin_id, user_id, shop_id)
    references public.checkins (checkin_id, user_id, shop_id) on delete cascade
);

create index reviews_shop_created_at_visible_idx
  on public.reviews (shop_id, created_at desc) where hidden = false;
create index reviews_user_id_idx on public.reviews (user_id);
create index reviews_photo_path_idx
  on public.reviews (photo_path) where photo_path is not null;

create trigger reviews_set_updated_at
  before update on public.reviews
  for each row execute function public.set_updated_at();

alter table public.reviews enable row level security;

create policy reviews_select_visible_or_own
  on public.reviews for select
  to authenticated
  using (hidden = false or (select auth.uid()) = user_id);

create policy reviews_insert_own
  on public.reviews for insert
  to authenticated
  with check ((select auth.uid()) = user_id and hidden = false);

create policy reviews_update_own
  on public.reviews for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy reviews_delete_own
  on public.reviews for delete
  to authenticated
  using ((select auth.uid()) = user_id);

revoke all on table public.reviews from public, anon, authenticated, service_role;
grant select on table public.reviews to authenticated;
grant insert (checkin_id, shop_id, stars, body, photo_path) on table public.reviews to authenticated;
grant update (stars, body, photo_path) on table public.reviews to authenticated;
grant delete on table public.reviews to authenticated;
grant select, insert, update, delete on table public.reviews to service_role;


-- =============================================================================
-- 3.7 review_reports（通報）
--   本人が作成のみ。誰も読めない（管理画面で確認）。
--   authenticated に SELECT が無いので、insert の後に select（返却）を求めないこと。
-- =============================================================================
create table public.review_reports (
  report_id   uuid        not null default gen_random_uuid() primary key,
  review_id   uuid        not null
                references public.reviews (review_id) on delete cascade,
  reporter_id uuid        not null default auth.uid()
                references public.profiles (user_id) on delete cascade,
  created_at  timestamptz not null default now(),
  unique (review_id, reporter_id)
);

create index review_reports_reporter_id_idx on public.review_reports (reporter_id);

alter table public.review_reports enable row level security;

create policy review_reports_insert_own
  on public.review_reports for insert
  to authenticated
  with check (
    (select auth.uid()) = reporter_id
    and exists (
      select 1
      from public.reviews r
      where r.review_id = review_reports.review_id
        and r.hidden = false
    )
  );

revoke all on table public.review_reports from public, anon, authenticated, service_role;
grant insert (review_id) on table public.review_reports to authenticated;
grant select, insert, update, delete on table public.review_reports to service_role;


-- =============================================================================
-- 3.8 town_conquests（町制覇の記録）
--   同じ町で2回コインを付与しないための記録。書き込みは Edge Functions のみ。
-- =============================================================================
create table public.town_conquests (
  user_id      uuid        not null
                 references public.profiles (user_id) on delete cascade,
  town_id      text        not null
                 references public.towns (town_id) on delete restrict,
  conquered_at timestamptz not null default now(),
  primary key (user_id, town_id)
);

alter table public.town_conquests enable row level security;

create policy town_conquests_select_own
  on public.town_conquests for select
  to authenticated
  using ((select auth.uid()) = user_id);

revoke all on table public.town_conquests from public, anon, authenticated, service_role;
grant select on table public.town_conquests to authenticated;
grant select, insert, update, delete on table public.town_conquests to service_role;


-- =============================================================================
-- 3.9 fog_cells（晴れた霧セル）
--   保存するのは店の周り 200m と町制覇のセルだけ。ルート由来（'route'）は許さない。
--   グリッドは地球全体で固定の原点（自宅を原点にしない）。
-- =============================================================================
create table public.fog_cells (
  user_id    uuid        not null
               references public.profiles (user_id) on delete cascade,
  cell_x     integer     not null,
  cell_y     integer     not null,
  source     text        not null check (source in ('shop_radius', 'town')),
  cleared_at timestamptz not null default now(),
  primary key (user_id, cell_x, cell_y)
);

create index fog_cells_user_cleared_at_idx on public.fog_cells (user_id, cleared_at);

alter table public.fog_cells enable row level security;

create policy fog_cells_select_own
  on public.fog_cells for select
  to authenticated
  using ((select auth.uid()) = user_id);

revoke all on table public.fog_cells from public, anon, authenticated, service_role;
grant select on table public.fog_cells to authenticated;
grant select, insert, update, delete on table public.fog_cells to service_role;


-- =============================================================================
-- 3.10 daily_hints（デイリーの気配）
--   1日3件。自宅からの方角・距離は列にしない。書き込みは Edge Functions のみ。
-- =============================================================================
create table public.daily_hints (
  hint_id              uuid        not null default gen_random_uuid() primary key,
  user_id              uuid        not null
                         references public.profiles (user_id) on delete cascade,
  hint_date            date        not null,
  slot                 smallint    not null check (slot between 1 and 3),
  shop_id              text        not null
                         references public.shops (shop_id) on delete restrict,
  hint_genre           text        null,
  hint_catch           text        null,
  hint_budget          text        null,
  is_mystery           boolean     not null default false
                         check (not is_mystery or hint_genre is null),
  completed_checkin_id uuid        null
                         references public.checkins (checkin_id) on delete set null,
  created_at           timestamptz not null default now(),
  unique (user_id, hint_date, slot),
  unique (user_id, hint_date, shop_id)
);

create index daily_hints_shop_id_idx on public.daily_hints (shop_id);
create index daily_hints_completed_checkin_id_idx on public.daily_hints (completed_checkin_id);

alter table public.daily_hints enable row level security;

create policy daily_hints_select_own
  on public.daily_hints for select
  to authenticated
  using ((select auth.uid()) = user_id);

revoke all on table public.daily_hints from public, anon, authenticated, service_role;
grant select on table public.daily_hints to authenticated;
grant select, insert, update, delete on table public.daily_hints to service_role;


-- =============================================================================
-- 3.11 weekly_missions（週ミッション）
--   1週に1件。condition_params に自宅の座標・距離の基準点は入れない。
--   書き込みは Edge Functions のみ。
-- =============================================================================
create table public.weekly_missions (
  mission_id       uuid        not null default gen_random_uuid() primary key,
  user_id          uuid        not null
                     references public.profiles (user_id) on delete cascade,
  week_start       date        not null,
  condition_type   text        not null
                     check (condition_type in ('genre', 'first_visit', 'far_from_home', 'same_town', 'hint_shop')),
  condition_params jsonb       not null default '{}'::jsonb
                     check (jsonb_typeof(condition_params) = 'object'),
  target           smallint    not null default 3 check (target > 0),
  progress         smallint    not null default 0,
  completed_at     timestamptz null,
  created_at       timestamptz not null default now(),
  check (progress between 0 and target),
  check ((completed_at is not null) = (progress = target)),
  unique (user_id, week_start)
);

alter table public.weekly_missions enable row level security;

create policy weekly_missions_select_own
  on public.weekly_missions for select
  to authenticated
  using ((select auth.uid()) = user_id);

revoke all on table public.weekly_missions from public, anon, authenticated, service_role;
grant select on table public.weekly_missions to authenticated;
grant select, insert, update, delete on table public.weekly_missions to service_role;


-- =============================================================================
-- 3.12 gacha_sessions（ガチャ1回分＝単発 or 10連）
--   コイン台帳の1行と排出の行を結ぶ単位。書き込みは Edge Functions のみ。
-- =============================================================================
create table public.gacha_sessions (
  session_id uuid        not null default gen_random_uuid() primary key,
  user_id    uuid        not null
               references public.profiles (user_id) on delete cascade,
  draw_type  text        not null check (draw_type in ('single', 'ten')),
  cost       integer     not null check (cost > 0),
  drawn_at   timestamptz not null default now(),
  check (draw_type <> 'single' or cost = 100),
  -- 10連は割引なしの 1000（D-12、決定 2026-11-05）
  check (draw_type <> 'ten' or cost = 1000)
);

create index gacha_sessions_user_drawn_at_idx on public.gacha_sessions (user_id, drawn_at desc);

alter table public.gacha_sessions enable row level security;

create policy gacha_sessions_select_own
  on public.gacha_sessions for select
  to authenticated
  using ((select auth.uid()) = user_id);

revoke all on table public.gacha_sessions from public, anon, authenticated, service_role;
grant select on table public.gacha_sessions to authenticated;
grant select, insert, update, delete on table public.gacha_sessions to service_role;


-- =============================================================================
-- 3.13 gacha_draws（排出1体ごと）
--   天井は user_pull_no と rarity から導出する。書き込みは Edge Functions のみ。
-- =============================================================================
create table public.gacha_draws (
  draw_id      uuid     not null default gen_random_uuid() primary key,
  session_id   uuid     not null
                 references public.gacha_sessions (session_id) on delete cascade,
  user_id      uuid     not null
                 references public.profiles (user_id) on delete cascade,
  position     smallint not null check (position between 1 and 10),
  user_pull_no integer  not null check (user_pull_no >= 1),
  character_id smallint not null,
  rarity       smallint not null check (rarity between 3 and 5),
  guarantee    text     not null default 'none'
                 check (guarantee in ('none', 'ten_floor', 'ceiling')),
  -- rarity が NULL の初回キャラは参照できない＝ガチャからは出ない
  foreign key (character_id, rarity)
    references public.characters (character_id, rarity) on delete restrict,
  unique (session_id, position),
  -- 同時に2回回しても通し番号が衝突して片方が失敗する（天井の二重取り防止）
  unique (user_id, user_pull_no)
);

alter table public.gacha_draws enable row level security;

create policy gacha_draws_select_own
  on public.gacha_draws for select
  to authenticated
  using ((select auth.uid()) = user_id);

revoke all on table public.gacha_draws from public, anon, authenticated, service_role;
grant select on table public.gacha_draws to authenticated;
grant select, insert, update, delete on table public.gacha_draws to service_role;


-- =============================================================================
-- 3.14 user_characters（所持キャラ）
--   初回キャラはここに入れない（profiles.starter_character_id）。書き込みは Edge Functions のみ。
-- =============================================================================
create table public.user_characters (
  user_id         uuid        not null
                    references public.profiles (user_id) on delete cascade,
  character_id    smallint    not null
                    references public.characters (character_id) on delete restrict,
  obtained_at     timestamptz not null default now(),
  duplicate_count integer     not null default 0 check (duplicate_count >= 0),
  primary key (user_id, character_id)
);

alter table public.user_characters enable row level security;

create policy user_characters_select_own
  on public.user_characters for select
  to authenticated
  using ((select auth.uid()) = user_id);

revoke all on table public.user_characters from public, anon, authenticated, service_role;
grant select on table public.user_characters to authenticated;
grant select, insert, update, delete on table public.user_characters to service_role;


-- =============================================================================
-- 3.15 coin_ledger（グルメコインの台帳）
--   残高は合計（coin_balances ビュー）。金額は CHECK で固定。書き込みは Edge Functions のみ。
-- =============================================================================
create table public.coin_ledger (
  entry_id          uuid        not null default gen_random_uuid() primary key,
  user_id           uuid        not null
                      references public.profiles (user_id) on delete cascade,
  reason            text        not null
                      check (reason in ('checkin', 'hint_bonus', 'weekly_mission', 'town_conquest', 'gacha')),
  amount            integer     not null,
  checkin_id        uuid        null
                      references public.checkins (checkin_id) on delete cascade,
  weekly_mission_id uuid        null
                      references public.weekly_missions (mission_id) on delete cascade,
  town_id           text        null,
  gacha_session_id  uuid        null
                      references public.gacha_sessions (session_id) on delete cascade,
  created_at        timestamptz not null default now(),
  foreign key (user_id, town_id)
    references public.town_conquests (user_id, town_id) on delete cascade,
  -- 金額の CHECK（D-11）
  check (
       (reason = 'checkin'        and amount = 30)
    or (reason = 'hint_bonus'     and amount = 10)
    or (reason = 'weekly_mission' and amount = 100)
    or (reason = 'town_conquest'  and amount = 100)
    or (reason = 'gacha'          and amount < 0)
  ),
  -- 参照列の CHECK（理由と参照先の対応。ちょうど1つだけ埋まる）
  check (
        (checkin_id is not null)        = (reason in ('checkin', 'hint_bonus'))
    and (weekly_mission_id is not null) = (reason = 'weekly_mission')
    and (town_id is not null)           = (reason = 'town_conquest')
    and (gacha_session_id is not null)  = (reason = 'gacha')
  )
);

create index coin_ledger_user_created_at_idx on public.coin_ledger (user_id, created_at desc);
-- 二重付与を防ぐ部分一意インデックス
create unique index coin_ledger_checkin_reason_uniq
  on public.coin_ledger (checkin_id, reason) where checkin_id is not null;
create unique index coin_ledger_weekly_mission_uniq
  on public.coin_ledger (weekly_mission_id) where weekly_mission_id is not null;
create unique index coin_ledger_user_town_uniq
  on public.coin_ledger (user_id, town_id) where town_id is not null;
create unique index coin_ledger_gacha_session_uniq
  on public.coin_ledger (gacha_session_id) where gacha_session_id is not null;

alter table public.coin_ledger enable row level security;

create policy coin_ledger_select_own
  on public.coin_ledger for select
  to authenticated
  using ((select auth.uid()) = user_id);

revoke all on table public.coin_ledger from public, anon, authenticated, service_role;
grant select on table public.coin_ledger to authenticated;
grant select, insert, update, delete on table public.coin_ledger to service_role;


-- =============================================================================
-- 3.16 record_snapshots（週次の記録）
--   数字だけを持つ（地図画像・セル一覧は持たない）。本人が作成のみ。
-- =============================================================================
create table public.record_snapshots (
  user_id       uuid          not null default auth.uid()
                  references public.profiles (user_id) on delete cascade,
  week_start    date          not null,
  cleared_ratio numeric(5, 4) not null check (cleared_ratio between 0 and 1),
  shop_count    integer       not null check (shop_count >= 0),
  quest_count   integer       not null check (quest_count >= 0),
  created_at    timestamptz   not null default now(),
  primary key (user_id, week_start)
);

alter table public.record_snapshots enable row level security;

create policy record_snapshots_select_own
  on public.record_snapshots for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy record_snapshots_insert_own
  on public.record_snapshots for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

revoke all on table public.record_snapshots from public, anon, authenticated, service_role;
grant select on table public.record_snapshots to authenticated;
grant insert (week_start, cleared_ratio, shop_count, quest_count) on table public.record_snapshots to authenticated;
grant select, insert, update, delete on table public.record_snapshots to service_role;


-- =============================================================================
-- 3.17 badges（バッジ・称号のマスタ）
--   獲得条件・名前が未決定のため初期データは入れない。書き込みは migration / 管理画面のみ。
-- =============================================================================
create table public.badges (
  badge_id    smallint    not null primary key check (badge_id > 0),
  code        text        not null unique check (code ~ '^[a-z0-9_]+$'),
  name        text        not null check (btrim(name) <> ''),
  description text        null,
  icon_path   text        null,
  sort_order  smallint    not null default 0,
  created_at  timestamptz not null default now()
);

alter table public.badges enable row level security;

create policy badges_select_authenticated
  on public.badges for select
  to authenticated
  using (true);

revoke all on table public.badges from public, anon, authenticated, service_role;
grant select on table public.badges to authenticated;
grant select, insert, update, delete on table public.badges to service_role;


-- =============================================================================
-- 3.18 user_badges（バッジの獲得記録）
--   user_id は設計 D-28 のとおり auth.users を直接参照。付与は Edge Functions のみ。
-- =============================================================================
create table public.user_badges (
  user_id   uuid        not null
              references auth.users (id) on delete cascade,
  badge_id  smallint    not null
              references public.badges (badge_id) on delete restrict,
  earned_at timestamptz not null default now(),
  primary key (user_id, badge_id)
);

alter table public.user_badges enable row level security;

create policy user_badges_select_own
  on public.user_badges for select
  to authenticated
  using ((select auth.uid()) = user_id);

revoke all on table public.user_badges from public, anon, authenticated, service_role;
grant select on table public.user_badges to authenticated;
grant select, insert, update, delete on table public.user_badges to service_role;


-- =============================================================================
-- 4.1 public_profiles（他人に見せるニックネーム）
--   security definer のビュー（所有者 postgres の権限で profiles を読む）。
--   列は user_id, nickname だけ。対象は非表示でない感想を1件以上持つユーザーだけ。
--   Security Advisor の security_definer_view 警告は意図した例外（設計 4.1）。
--   ビューには search_path を設定できないため、中の名前はすべてスキーマ付きで書く。
-- =============================================================================
create view public.public_profiles
  with (security_invoker = false, security_barrier = true) as
select p.user_id, p.nickname
from public.profiles p
where exists (
  select 1 from public.reviews r
  where r.user_id = p.user_id and r.hidden = false
);

revoke all on table public.public_profiles from public, anon, authenticated, service_role;
grant select on table public.public_profiles to authenticated;
grant select on table public.public_profiles to service_role;


-- =============================================================================
-- 4.2 coin_balances（コイン残高）
--   security invoker のビュー。呼び出した人の RLS が coin_ledger に効く。
--   台帳が0行のユーザーは行が返らない（ブラウザは 0 として扱う）。
-- =============================================================================
create view public.coin_balances
  with (security_invoker = true) as
select user_id, sum(amount)::bigint as balance
from public.coin_ledger
group by user_id;

revoke all on table public.coin_balances from public, anon, authenticated, service_role;
grant select on table public.coin_balances to authenticated;
grant select on table public.coin_balances to service_role;


-- =============================================================================
-- 5. Storage（感想の写真）
--   非公開 bucket。読めるのはログインユーザーで、自分のフォルダか
--   非表示でない感想に付いている写真だけ。UPDATE（上書き）のポリシーは作らない。
--   オブジェクト名は {auth.uid()}/{uuid}.{jpg|webp}。
--   storage.objects の RLS は Supabase が最初から有効にしているので、ここでは触らない。
-- =============================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'review-photos',
  'review-photos',
  false,
  307200,  -- 300KB（300 × 1024 バイト）
  array['image/jpeg', 'image/webp']
);

create policy review_photos_select
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'review-photos'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or exists (
        select 1
        from public.reviews r
        where r.photo_path = storage.objects.name
          and r.hidden = false
      )
    )
  );

create policy review_photos_insert_own
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'review-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy review_photos_delete_own
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'review-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );


-- =============================================================================
-- 6.1 characters の初期データ
--   ★5＝1〜4、★4＝5〜12、★3＝13〜30、初回キャラ 101・102（rarity なし）。
--   名前（name）と画像パス（sprite_path）は入れない（NULL のまま）。
--   素材を受け取った後に別の migration か管理画面で登録する（設計 D-10, D-29）。
-- =============================================================================
insert into public.characters (character_id, pool, rarity)
select g::smallint, 'gacha', 5::smallint from generate_series(1, 4) as g;

insert into public.characters (character_id, pool, rarity)
select g::smallint, 'gacha', 4::smallint from generate_series(5, 12) as g;

insert into public.characters (character_id, pool, rarity)
select g::smallint, 'gacha', 3::smallint from generate_series(13, 30) as g;

insert into public.characters (character_id, pool, rarity)
values (101, 'starter', null),
       (102, 'starter', null);

commit;
