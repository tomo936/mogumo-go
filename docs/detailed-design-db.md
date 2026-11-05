# もぐもGO 詳細設計: DB テーブル（Cycle 1）

## 1. 位置づけ

- 工程上の位置: 「要件定義 → 基本設計 → **詳細設計** → 実装 → 検証 → 振り返り」の詳細設計のうち、DB（Supabase / PostgreSQL）の部分。`docs/basic-design.md` 第3章（3.1〜3.4）、6.1、6.2、7.1、7.2、9章を詳しくしたもの。
- 情報源: `docs/basic-design.md`、`docs/SPEC.md`（§2.5、§5 の S2〜S6・S8・S9・S11〜S15、§8「キャラガチャを初版から入れる」「キャラデザイン試作と採用」）、`CLAUDE.md`
- 作成日: 2026-11-05
- ステータス: **ドラフト（要確認あり）**。要確認事項は 7章に D-xx で一覧にした。
- 前提（ユーザーの決定・環境）:
  - バックエンドは Supabase で確定（基本設計 U-01 は (a) とみなす）。認証は Supabase Auth の Google ログイン（`auth.users`）。U-02 も (a)、U-04 は (a) RLS、U-06 は (a) Supabase Storage とみなす。
  - Supabase プロジェクトは「API への自動公開（auto-expose）OFF」。新しいテーブル・ビュー・関数には anon / authenticated / service_role の権限が自動で付かない。**この文書の GRANT 欄に書いたものだけを付ける。**
  - 改ざん防止が要る書き込み（チェックイン確定・コイン付与・ガチャ抽選・気配や週ミッションの生成）は Edge Functions（service_role）で行う（基本設計 1.3、3.4、U-11）。これらのテーブルには authenticated の INSERT/UPDATE/DELETE の GRANT もポリシーも付けない。
- この文書で決めないこと: SQL ファイルそのもの（実装役が書く）、Edge Functions の入出力の詳細、霧のグリッドの座標変換式、ガチャの抽選アルゴリズム。

---

## 2. 共通方針

### 2.1 型と命名
- スキーマは `public`（アプリのテーブル・ビュー）。Storage は Supabase 標準の `storage` スキーマ。
- 名前は snake_case。テーブル名は複数形。
- 主キー:
  - ユーザーの行（チェックイン・感想等）は `uuid`、既定値 `gen_random_uuid()`。連番（identity）を使わないので **sequence の GRANT は不要**。
  - 外部の ID をそのまま使うもの: `shops.shop_id`（ホットペッパーの店舗 ID）と `towns.town_id`（境界データ側のコード）は `text`。
  - キャラマスタ `characters.character_id` は `smallint`（SPEC §8 の番号 1〜30 をそのまま使う）。
- 日時は `timestamptz`（UTC で保存）、既定値 `now()`。日付だけのもの（デイリー・週）は `date`（2.6）。
- 緯度経度は `double precision`。**PostGIS は入れない**（基本設計は地理型を必須としていない。距離判定は Edge Functions／ブラウザの計算で足りる。U-03 → D-08）。
- 列挙値は **enum 型を使わず `text` ＋ `CHECK (col in (...))`** で統一する（値の追加が migration 1本で済み、型の作り直しが要らないため）。
- 列の既定値で済むものはトリガーを使わない。トリガーは `updated_at` だけ（4.3）。

### 2.2 ユーザーとの紐づけと削除（退会 S13 / U-12）
- `profiles.user_id` が `auth.users(id)` を参照し `ON DELETE CASCADE`。
- それ以外のユーザー所有テーブルは `profiles(user_id)` を参照し `ON DELETE CASCADE`。
  - 理由: (1) `auth.users` の削除 → `profiles` → 全データ、と1本の連鎖で消える。(2) 初回設定（profiles の作成）より前にデータが作られないことを外部キーで保証できる。(3) PostgREST の埋め込み（`reviews` から投稿者のニックネーム）に使える。
- マスタ（`shops`・`towns`・`characters`）への参照は `ON DELETE RESTRICT`（マスタを消してもユーザーの記録が消えないように。N-10 との関係は D-22）。
- Storage の写真は SQL の CASCADE では消えない（5.4）。

### 2.3 RLS
- **全テーブルで RLS を有効にする**（読み取り専用のマスタも含む。Supabase の推奨・linter 対策）。
- ポリシーは対象ロールを `TO authenticated` で必ず指定する。`anon` 向けのポリシーは1つも作らない（アプリはログイン必須。D-02）。
- 本人判定は `(select auth.uid()) = user_id` の形で書く（`auth.uid()` を `select` で包むと行ごとに再評価されず速い。Supabase 推奨形）。
- service_role は RLS を素通りする（BYPASSRLS）ため、service_role 向けのポリシーは書かない。ただし **テーブルの GRANT は別途必要**。
- **Edge Functions は user_id をリクエスト本文から受け取らず、必ず JWT（`auth.getUser()`）から取り出す**（service_role は RLS で守られないため、ここを間違えると他人の行を書ける）。

### 2.4 GRANT（auto-expose OFF 前提）
- `anon`: **どのテーブル・ビュー・関数にも権限を付けない。**
- `authenticated`: 各テーブルの GRANT 欄の操作だけ。書き込みを許すテーブル（profiles・reviews・review_reports・record_snapshots）は **列単位 GRANT** にして、本人 ID 列・`hidden`・タイムスタンプ等を書けないようにする。
- `service_role`: 全テーブルに `SELECT, INSERT, UPDATE, DELETE`（Edge Functions 用。RLS は素通りだが GRANT は要る）。
- 本人 ID 列（`user_id` / `reporter_id`）は **既定値 `auth.uid()`** にして、ブラウザからは送らせない（INSERT の列 GRANT に含めない）。ポリシーの WITH CHECK でも二重に確認する。
- 関数は作成時に PUBLIC へ EXECUTE が付く PostgreSQL の既定があるため、**作った関数はすべて `REVOKE EXECUTE ... FROM PUBLIC, anon, authenticated`** してから必要なロールにだけ付ける（4章）。
- 実装時の確認事項: `public` スキーマの `USAGE` が anon / authenticated / service_role に付いているか（auto-expose OFF でも通常は付いている）。付いていなければ authenticated と service_role にだけ付ける。

### 2.5 自宅座標を持たない（基本設計 3.1、SPEC §2.5・S15）
**どのテーブル・ビュー・Storage にも、自宅の座標・自宅の概略位置・自宅からの距離・自宅を基準にした値を持たせない。** 3章の全列について確認済み（チェック結果は 3.19）。あわせて次も守る。
- 霧のグリッドは **地球全体で固定の原点・固定の刻み** で定義する（自宅を原点にしたグリッドにすると、セル番号から自宅が逆算できる）。D-06。
- ルート（自宅→店）由来の霧セルはサーバーに保存しない（D-06、U-08）。
- チェックイン時の現在地は保存しない（D-07）。
- shops（店キャッシュ）に「誰がどこを中心に検索したか」を残さない（user_id 列・検索中心の列を作らない。Edge Functions のログにも検索中心・現在地を出さない）。

### 2.6 日と週（N-08）
- `daily_hints.hint_date`・`weekly_missions.week_start`・`record_snapshots.week_start` は `date` 型。
- 何時で日を切り替えるか（JST 0時か朝の指定時刻か）、週の始まりの曜日（月曜か、自宅設定日起点か）は **アプリ側（Edge Functions）の決定** とし、DB には曜日の CHECK を付けない。D-19。

### 2.7 秘密情報（非機能要件。基本設計 7.1 の DB 側の具体化）
| 秘密 | 保持場所 | 出さない場所 |
|---|---|---|
| Supabase service_role キー | Edge Functions の環境（Supabase が自動で渡す `SUPABASE_SERVICE_ROLE_KEY`） | ブラウザのコード・バンドル（`VITE_` 付きの環境変数にしない）、DB のテーブル、ログ、Git |
| DB 接続文字列（`SUPABASE_DB_URL`、パスワード入り） | Edge Functions の環境のみ（4.4 で直接接続を使う場合） | 同上 |
| ホットペッパー API キー | Edge Functions のシークレット | **DB に保存しない**（設定テーブルを作らない）。`shops` にキー付きの問い合わせ URL を保存しない（`photo_url` は API が返す画像 URL のみ）。関数のレスポンス・ログにも出さない |
| Supabase anon キー | ブラウザ（公開前提。`src/lib/supabase.ts` が `VITE_SUPABASE_ANON_KEY` で使う） | — 守りは RLS と GRANT。anon ロールには何も GRANT しない |
- DB に秘密を入れる列は作らない。管理者の作業は Supabase 管理画面（postgres ロール）で行い、アプリに管理者用のロールや列は作らない（S13、U-13）。

---

## 3. テーブル定義

作成順（外部キーの依存順）: characters → profiles → towns → shops → checkins → reviews → review_reports → town_conquests → fog_cells → daily_hints → weekly_missions → gacha_sessions → gacha_draws → user_characters → coin_ledger → record_snapshots → badges → user_badges

### テーブル一覧
| テーブル | 書く人 | 読む人 | 基本設計 3.2 との違い |
|---|---|---|---|
| characters | migration（seed）／管理画面 | authenticated | 初回キャラ用に `pool` 列を追加（D-09） |
| profiles | 本人（作成・nickname と初回キャラの更新） | 本人のみ（他人へは 4.1 のビュー） | — |
| towns | 取り込みスクリプト／service_role | authenticated | 区域の形を GeoJSON（jsonb）＋外接矩形で持つ（D-08） |
| shops | Edge Functions（ホットペッパー中継） | authenticated | ジャンル・予算をコードと名前に分けた |
| checkins | Edge Functions | 本人のみ | 現在地 lat/lng を **持たない**（D-07） |
| reviews | 本人 | authenticated（hidden でない行＋本人の行） | — |
| review_reports | 本人（作成のみ） | 誰も読めない（管理画面のみ） | — |
| town_conquests | Edge Functions | 本人のみ | **追加**（町制覇の重複付与防止。D-14） |
| fog_cells | Edge Functions | 本人のみ | source から「ルート」を除外（D-06） |
| daily_hints | Edge Functions | 本人のみ | status の代わりに `completed_checkin_id` |
| weekly_missions | Edge Functions | 本人のみ | — |
| gacha_sessions | Edge Functions | 本人のみ | **追加**（1回／10連の単位。コイン台帳の参照先。D-12） |
| gacha_draws | Edge Functions | 本人のみ | 1体ごとの行。天井カウンタは通し番号で持つ（D-12） |
| user_characters | Edge Functions | 本人のみ | — |
| coin_ledger | Edge Functions | 本人のみ | ref_id を種類別の外部キー列に分けた |
| record_snapshots | 本人（作成のみ） | 本人のみ | 地図画像は持たない（D-18） |
| badges | migration／管理画面 | authenticated | **追加**（ユーザー決定 2026-11-05、SPEC 未反映。D-28） |
| user_badges | Edge Functions | 本人のみ | **追加**（同上） |

---

### 3.1 characters（キャラマスタ）
SPEC §8: 候補30体（★5＝1〜4、★4＝5〜12、★3＝13〜30）。初回設定の男の子・女の子もここに置く（D-09）。

| 列 | 型 | NULL | 既定 | 制約 | 説明 |
|---|---|---|---|---|---|
| character_id | smallint | NOT NULL | — | PK、`CHECK (character_id > 0)` | ガチャ候補は SPEC の番号 1〜30。初回キャラは仮に 101・102（D-09） |
| pool | text | NOT NULL | — | `CHECK (pool in ('starter','gacha'))` | starter＝初回設定で選ぶ2体、gacha＝ガチャの排出対象 |
| rarity | smallint | NULL | — | `CHECK (rarity between 3 and 5)`、`CHECK ((pool = 'gacha') = (rarity is not null))` | ★3〜★5。初回キャラは NULL |
| name | text | NULL | — | `CHECK (name is null or btrim(name) <> '')` | 表示名。SPEC に名前が無いため seed では NULL（D-10） |
| sprite_path | text | NULL | — | — | スプライトシートの置き場所（`public/` 配下の相対パス想定）。**素材はシロ（Muse）が作るため、受け取るまで NULL**（ダミーのパス・外部 URL・プレースホルダ画像は入れない。D-29） |
| created_at | timestamptz | NOT NULL | now() | — | |

- キー: PK `character_id`。一意 `(character_id, rarity)`、一意 `(character_id, pool)`（それぞれ gacha_draws と profiles の複合外部キーの参照先。PK があるので冗長だが外部キーのために要る）。
- インデックス: PK と上記一意制約のみ。
- RLS: 有効。SELECT `TO authenticated USING (true)`。INSERT/UPDATE/DELETE のポリシーなし。
- GRANT: anon なし／authenticated `SELECT`／service_role `SELECT, INSERT, UPDATE, DELETE`。
- ★と番号の対応（1〜4＝5 等）は CHECK にせず seed で入れる（キャラを足すたびに CHECK を作り直さなくて済むように）。

### 3.2 profiles（ユーザーの公開名と初回設定）
S13・S15。**自宅座標の列は作らない。**

| 列 | 型 | NULL | 既定 | 制約 | 説明 |
|---|---|---|---|---|---|
| user_id | uuid | NOT NULL | auth.uid() | PK、FK → `auth.users(id)` ON DELETE CASCADE | |
| nickname | text | NOT NULL | — | `CHECK (char_length(nickname) between 1 and 10)`、`CHECK (btrim(nickname) <> '')` | 10文字まで・重複可（一意制約を付けない）。数え方は D-05 |
| starter_character_id | smallint | NOT NULL | — | 複合 FK `(starter_character_id, starter_pool)` → `characters(character_id, pool)` ON DELETE RESTRICT | 初回設定で選んだキャラ（男の子／女の子） |
| starter_pool | text | NOT NULL | 'starter' | `CHECK (starter_pool = 'starter')` | 複合外部キー用の固定値。ガチャ用キャラ（★5 など）を初回キャラに指定できないようにする |
| record_started_at | timestamptz | NOT NULL | now() | — | 記録の開始時点（S6「自宅設定の完了時点」）。profiles の作成＝初回設定の完了とみなす。後から変えない（D-25） |
| created_at | timestamptz | NOT NULL | now() | — | |
| updated_at | timestamptz | NOT NULL | now() | — | トリガーで更新（4.3） |

- キー: PK `user_id`。外部キーは上表。
- インデックス: PK のみ。
- RLS: 有効。
  - SELECT `TO authenticated USING ((select auth.uid()) = user_id)`（本人のみ。他人のニックネームは 4.1 のビュー経由）
  - INSERT `TO authenticated WITH CHECK ((select auth.uid()) = user_id)`
  - UPDATE `TO authenticated USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id)`
  - DELETE ポリシーなし（退会は Edge Functions で auth.users ごと消す）
- GRANT: anon なし／authenticated `SELECT`（全列）、`INSERT (nickname, starter_character_id)`、`UPDATE (nickname, starter_character_id)`／service_role 全操作。
- 初回設定の流れ: ブラウザが `insert({ nickname, starter_character_id })`。user_id・starter_pool・record_started_at は既定値で入る。アバターとして「今使っているキャラ」の列は SPEC に無いため作らない（D-26）。

### 3.3 towns（町・丁目の区域）
S2 ③ 町制覇。境界データの出典は未決定（N-09）。

| 列 | 型 | NULL | 既定 | 制約 | 説明 |
|---|---|---|---|---|---|
| town_id | text | NOT NULL | — | PK | 境界データ側のコードをそのまま使う |
| name | text | NOT NULL | — | `CHECK (btrim(name) <> '')` | 町の名前（図鑑カードの「町の名前」S15） |
| boundary | jsonb | NOT NULL | — | `CHECK (boundary->>'type' in ('Polygon','MultiPolygon'))` | 区域の形（GeoJSON の geometry。座標は [lng, lat]） |
| min_lat | double precision | NOT NULL | — | `CHECK (min_lat between -90 and 90)` | 外接矩形（範囲検索用） |
| max_lat | double precision | NOT NULL | — | `CHECK (max_lat between -90 and 90)`、`CHECK (min_lat <= max_lat)` | |
| min_lng | double precision | NOT NULL | — | `CHECK (min_lng between -180 and 180)` | |
| max_lng | double precision | NOT NULL | — | `CHECK (max_lng between -180 and 180)`、`CHECK (min_lng <= max_lng)` | |
| created_at | timestamptz | NOT NULL | now() | — | |

- キー: PK `town_id`。
- インデックス: `(min_lat, max_lat)`（表示範囲と重なる町を引く。件数が少ないうちはこれで足りる）。
- RLS: 有効。SELECT `TO authenticated USING (true)`。書き込みポリシーなし。
- GRANT: anon なし／authenticated `SELECT`／service_role 全操作。
- 店の町への割り当て（点が多角形に入るか）は PostGIS を使わず、取り込みスクリプトか Edge Functions（TypeScript）で計算して `shops.town_id` に入れる（D-08）。

### 3.4 shops（ホットペッパー由来の店キャッシュ）
S5・S9・S11。保存の可否・期間は規約次第（N-10、D-22）。

| 列 | 型 | NULL | 既定 | 制約 | 説明 |
|---|---|---|---|---|---|
| shop_id | text | NOT NULL | — | PK | ホットペッパーの店舗 ID |
| name | text | NOT NULL | — | `CHECK (btrim(name) <> '')` | 名前の無い店は保存しない（S9） |
| lat | double precision | NOT NULL | — | `CHECK (lat between -90 and 90)` | 店の位置（自宅ではない） |
| lng | double precision | NOT NULL | — | `CHECK (lng between -180 and 180)` | |
| genre_code | text | NULL | — | — | ジャンルのコード。NULL＝ジャンル不明（「謎の気配」の候補。S5） |
| genre_name | text | NULL | — | — | ジャンル名 |
| catch | text | NULL | — | — | キャッチコピー（気配ヒントの材料。S5） |
| budget_code | text | NULL | — | — | 予算帯のコード |
| budget_name | text | NULL | — | — | 予算帯の表示名（気配ヒントの材料） |
| photo_url | text | NULL | — | — | 公式写真の URL（図鑑一覧の台紙。S11）。キー付き URL は入れない |
| town_id | text | NULL | — | FK → `towns(town_id)` ON DELETE SET NULL | 所属する町。未割り当ては NULL |
| fetched_at | timestamptz | NOT NULL | now() | — | 最後にホットペッパーから取得した時刻 |

- キー: PK `shop_id`。
- インデックス: `(lat, lng)`（矩形の範囲検索）、`(town_id)`（町制覇の分母の計算）。
- RLS: 有効。SELECT `TO authenticated USING (true)`。書き込みポリシーなし。
- GRANT: anon なし／authenticated `SELECT`／service_role 全操作。
- 書き込みは Edge Functions（ホットペッパー中継）が upsert（`ON CONFLICT (shop_id) DO UPDATE`）。誰の検索で入ったかは残さない（2.5）。
- 気配の店も含めて全店の name が authenticated から読める。店名を 30m 到達まで渡さない作りにする場合はここを変える必要がある（N-04、D-17）。

### 3.5 checkins（チェックイン＝図鑑カードの元）
S3、基本設計 6.1。

| 列 | 型 | NULL | 既定 | 制約 | 説明 |
|---|---|---|---|---|---|
| checkin_id | uuid | NOT NULL | gen_random_uuid() | PK | |
| user_id | uuid | NOT NULL | — | FK → `profiles(user_id)` ON DELETE CASCADE | Edge Functions が JWT から入れる |
| shop_id | text | NOT NULL | — | FK → `shops(shop_id)` ON DELETE RESTRICT | |
| was_hint | boolean | NOT NULL | false | — | その日の自分の気配の店だったか。**ブラウザの申告ではなく** Edge Functions が daily_hints を見て決める |
| checked_in_at | timestamptz | NOT NULL | now() | — | 訪問日（図鑑カード S15） |
| reward_day | date | NULL | — | 部分一意 `(user_id, shop_id, reward_day) WHERE reward_day IS NOT NULL` | コインを付けた日。Edge Functions が「その店でその日まだコインを付けていない」ときだけ入れる。NULL はコイン無しの再チェックイン（D-15）。日の区切りは N-08 / D-19 |
| far_from_home | boolean | NOT NULL | false | — | 自宅から500m以上先だったか。**端末の申告**（距離・座標は受け取らない）。週ミッション条件 `far_from_home` の判定用（D-16、決定 2026-11-05） |

- **現在地（lat/lng）・店からの距離の列は作らない**。50m 判定は Edge Functions がリクエストの現在地で行い、判定後は捨てる（ログにも出さない）。D-07。
- キー: PK `checkin_id`。一意 `(checkin_id, user_id, shop_id)`（reviews の複合外部キーの参照先）。
- インデックス: `(user_id, checked_in_at desc)`（図鑑・記録）、`(user_id, shop_id)`（訪問済み判定・最新の訪問）、`(shop_id)`（shops の RESTRICT 判定）。
- 同じ店への再チェックインは許す（SPEC「複数回行った店は最新の訪問」）。**コイン（30、気配の店は +10）は同じ店につき1日1回まで**【ユーザー決定 2026-11-05、D-15】。チェックイン自体と記録は何度でも残る。coin_ledger の checkin / hint_bonus は reward_day が入ったチェックインにだけ付ける（Edge Functions の責務。DB では reward_day の一意で二重付与を止める）。
- RLS: 有効。SELECT `TO authenticated USING ((select auth.uid()) = user_id)`。書き込みポリシーなし。
- GRANT: anon なし／authenticated `SELECT`／service_role 全操作。

### 3.6 reviews（感想・星・写真）
S12・S13・S14。1チェックインにつき1件（N-06 → D-03）。

| 列 | 型 | NULL | 既定 | 制約 | 説明 |
|---|---|---|---|---|---|
| review_id | uuid | NOT NULL | gen_random_uuid() | PK | |
| user_id | uuid | NOT NULL | auth.uid() | FK → `profiles(user_id)` ON DELETE CASCADE | ブラウザからは送らない |
| checkin_id | uuid | NOT NULL | — | 一意、複合 FK `(checkin_id, user_id, shop_id)` → `checkins(checkin_id, user_id, shop_id)` ON DELETE CASCADE | 自分のチェックインで、かつ同じ店でないと作れない |
| shop_id | text | NOT NULL | — | FK → `shops(shop_id)` ON DELETE RESTRICT | 店ごとの一覧用（checkin と一致することを上の複合 FK で保証） |
| stars | smallint | NOT NULL | — | `CHECK (stars between 1 and 5)` | 範囲は SPEC に無い → D-04 |
| body | text | NULL | — | `CHECK (body is null or char_length(body) between 1 and 500)` | 感想本文（図鑑の「ひとこと」と同じものとみなす。N-06）。上限は D-04 |
| photo_path | text | NULL | — | `CHECK (photo_path is null or photo_path like (user_id::text \|\| '/%'))` | Storage `review-photos` 内のオブジェクト名（`{uid}/{uuid}.jpg` 等）。URL ではない。0〜1枚（S14） |
| hidden | boolean | NOT NULL | false | — | 管理者が非表示にする（S13）。本人は変更できない |
| created_at | timestamptz | NOT NULL | now() | — | |
| updated_at | timestamptz | NOT NULL | now() | — | トリガー（4.3） |

- キー: PK `review_id`。一意 `checkin_id`。外部キーは上表（user_id → profiles と、複合 FK → checkins の2本）。
- インデックス: `(shop_id, created_at desc) WHERE hidden = false`（お店詳細の「みんなの感想」）、`(user_id)`、`(photo_path) WHERE photo_path is not null`（Storage の読み取りポリシーで使う。5.2）。
- RLS: 有効。
  - SELECT `TO authenticated USING (hidden = false OR (select auth.uid()) = user_id)`（本人は自分の非表示の感想も見える。D-27）
  - INSERT `TO authenticated WITH CHECK ((select auth.uid()) = user_id AND hidden = false)`
  - UPDATE `TO authenticated USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id)`
  - DELETE `TO authenticated USING ((select auth.uid()) = user_id)`
  - anon 向けポリシーなし（D-02）
- GRANT: anon なし／authenticated `SELECT`（全列）、`INSERT (checkin_id, shop_id, stars, body, photo_path)`、`UPDATE (stars, body, photo_path)`、`DELETE`／service_role 全操作。
  - `hidden`・`user_id`・`checkin_id`・`shop_id` は UPDATE の列 GRANT に入れない（本人が非表示を解除したり、別の店に付け替えたりできない）。
- 投稿者名の表示: `reviews.user_id` と 4.1 の `public_profiles` を突き合わせる（PostgREST の埋め込み、または2回の問い合わせ）。Google の本名・メールは DB のどこからも返さない（S13）。
- 感想の削除時、写真ファイルは自動で消えない。ブラウザが Storage の削除も行う（5.4）。

### 3.7 review_reports（通報）
S13。対応は管理画面で手作業。

| 列 | 型 | NULL | 既定 | 制約 | 説明 |
|---|---|---|---|---|---|
| report_id | uuid | NOT NULL | gen_random_uuid() | PK | |
| review_id | uuid | NOT NULL | — | FK → `reviews(review_id)` ON DELETE CASCADE | 感想が消えると通報も消える（D-24） |
| reporter_id | uuid | NOT NULL | auth.uid() | FK → `profiles(user_id)` ON DELETE CASCADE | ブラウザからは送らない |
| created_at | timestamptz | NOT NULL | now() | — | |

- 通報理由の列は SPEC に無いため作らない。
- キー: PK `report_id`。**一意 `(review_id, reporter_id)`**（同じ人が同じ感想を重複して通報できない。重複時は一意違反＝「通報済み」として扱う）。
- インデックス: 上の一意制約（review_id 先頭）、`(reporter_id)`（退会時の CASCADE 用）。
- RLS: 有効。
  - INSERT `TO authenticated WITH CHECK ((select auth.uid()) = reporter_id AND exists (select 1 from public.reviews r where r.review_id = review_reports.review_id and r.hidden = false))`
  - SELECT / UPDATE / DELETE のポリシーなし（誰も読めない・消せない）
- GRANT: anon なし／authenticated `INSERT (review_id)` のみ（SELECT を付けない）／service_role 全操作。
- 実装上の注意: SELECT 権限が無いので、supabase-js では `.insert()` の後に `.select()` を付けない（返却を求めると権限エラーになる）。

### 3.8 town_conquests（町制覇の記録）【追加】
追加の理由: 町制覇のコイン +100 を **同じ町で2回付与しない** ための記録と、町全体の霧晴れ・記録の元データが要る。基本設計の「町制覇の進捗は checkins と shops.town_id から導出」はそのまま（進捗＝割合は導出、ここに入るのは「制覇した」という事実だけ）。

| 列 | 型 | NULL | 既定 | 制約 | 説明 |
|---|---|---|---|---|---|
| user_id | uuid | NOT NULL | — | FK → `profiles(user_id)` ON DELETE CASCADE | |
| town_id | text | NOT NULL | — | FK → `towns(town_id)` ON DELETE RESTRICT | |
| conquered_at | timestamptz | NOT NULL | now() | — | |

- キー: PK `(user_id, town_id)`。
- インデックス: PK のみ。
- RLS: 有効。SELECT `TO authenticated USING ((select auth.uid()) = user_id)`。書き込みポリシーなし。
- GRANT: anon なし／authenticated `SELECT`／service_role 全操作。
- 制覇判定「町内のお店の半分以上」の分母は shops キャッシュ内の同じ town_id の店数（D-14）。一度制覇したら、後で分母が増えても取り消さない。

### 3.9 fog_cells（晴れた霧セル）
S2・S15、U-08。**サーバーに保存するのは「店の周り 200m」と「町制覇」由来のセルだけ。ルート由来のセルは保存しない**（D-06）。

| 列 | 型 | NULL | 既定 | 制約 | 説明 |
|---|---|---|---|---|---|
| user_id | uuid | NOT NULL | — | FK → `profiles(user_id)` ON DELETE CASCADE | |
| cell_x | integer | NOT NULL | — | — | 25m グリッドの東西方向の番号。グリッドは地球全体で固定の原点（D-06） |
| cell_y | integer | NOT NULL | — | — | 南北方向の番号 |
| source | text | NOT NULL | — | `CHECK (source in ('shop_radius','town'))` | 最初に晴れた理由。**'route' は値として許さない** |
| cleared_at | timestamptz | NOT NULL | now() | — | 最初に晴れた時刻（週次記録で使う） |

- キー: PK `(user_id, cell_x, cell_y)`。同じセルが別の理由で再び晴れても行を増やさない（`ON CONFLICT DO NOTHING`）。
- インデックス: PK、`(user_id, cleared_at)`（週ごとの集計）。
- RLS: 有効。SELECT `TO authenticated USING ((select auth.uid()) = user_id)`。書き込みポリシーなし。
- GRANT: anon なし／authenticated `SELECT`／service_role 全操作。
- 書くのは Edge Functions（チェックイン確定時に店の座標から 200m 内のセル、町制覇時に町の多角形内のセル）。ルート由来のセルはブラウザが OSRM の結果から計算して端末内に保存する。機種変更時はチェックイン履歴と再設定した自宅から作り直す。
- このテーブルの中身は checkins と town_conquests から再計算できる（保存はキャッシュの意味）。テーブルごと持たない案は D-06 に記載。

### 3.10 daily_hints（デイリーの気配）
S4・S5・S10・S15、基本設計 6.2。生成は Edge Functions（入力は U-10 → D-17）。

| 列 | 型 | NULL | 既定 | 制約 | 説明 |
|---|---|---|---|---|---|
| hint_id | uuid | NOT NULL | gen_random_uuid() | PK | |
| user_id | uuid | NOT NULL | — | FK → `profiles(user_id)` ON DELETE CASCADE | |
| hint_date | date | NOT NULL | — | — | どの日の気配か（区切りは D-19） |
| slot | smallint | NOT NULL | — | `CHECK (slot between 1 and 3)` | 1日3件（S4）。気配なしの日は行を作らない |
| shop_id | text | NOT NULL | — | FK → `shops(shop_id)` ON DELETE RESTRICT | 行き先の店 |
| hint_genre | text | NULL | — | — | 曖昧表示用のジャンル（「中華？」の元）。謎の気配では NULL |
| hint_catch | text | NULL | — | — | キャッチコピーの断片（S5） |
| hint_budget | text | NULL | — | — | 予算帯（S5） |
| is_mystery | boolean | NOT NULL | false | `CHECK (not is_mystery or hint_genre is null)` | 謎の気配（ジャンル不明の店） |
| completed_checkin_id | uuid | NULL | — | FK → `checkins(checkin_id)` ON DELETE SET NULL | この気配の店にチェックインした記録。NULL＝未達成 |
| created_at | timestamptz | NOT NULL | now() | — | |

- 基本設計の `status` は、達成したかどうかしか状態が無いため `completed_checkin_id` の有無で表す（「選んだ」状態は SPEC に操作が無い）。
- 選ばなかった気配の「翌朝リセット」は、翌日の行を作るだけで表現する（古い行は消さずに残す。達成したクエスト数の記録に使うため）。
- キー: PK `hint_id`。一意 `(user_id, hint_date, slot)`、一意 `(user_id, hint_date, shop_id)`。
- インデックス: 上の一意制約（user_id 先頭）、`(shop_id)`、`(completed_checkin_id)`（SET NULL 用）。
- RLS: 有効。SELECT `TO authenticated USING ((select auth.uid()) = user_id)`。書き込みポリシーなし。
- GRANT: anon なし／authenticated `SELECT`／service_role 全操作。
- 自宅からの方角・距離（「北東 400m」など）は列にしない。表示が要るならブラウザが自宅座標から計算する（2.5）。

### 3.11 weekly_missions（週ミッション）
S4・S15。

| 列 | 型 | NULL | 既定 | 制約 | 説明 |
|---|---|---|---|---|---|
| mission_id | uuid | NOT NULL | gen_random_uuid() | PK | |
| user_id | uuid | NOT NULL | — | FK → `profiles(user_id)` ON DELETE CASCADE | |
| week_start | date | NOT NULL | — | — | 週の初日（区切りは D-19） |
| condition_type | text | NOT NULL | — | `CHECK (condition_type in ('genre','first_visit','far_from_home','same_town','hint_shop'))` | 条件プール5種（ジャンル指定／初めての店／自宅から500m以上先／同じ町で2軒／気配の店） |
| condition_params | jsonb | NOT NULL | '{}'::jsonb | `CHECK (jsonb_typeof(condition_params) = 'object')` | 条件の引数（例: genre なら `{"genre_code": "..."}`）。**自宅の座標・距離の基準点は入れない** |
| target | smallint | NOT NULL | 3 | `CHECK (target > 0)` | 目標軒数（S4: 週3軒） |
| progress | smallint | NOT NULL | 0 | `CHECK (progress between 0 and target)` | |
| completed_at | timestamptz | NULL | — | `CHECK ((completed_at is not null) = (progress = target))` | 達成時刻 |
| created_at | timestamptz | NOT NULL | now() | — | |

- キー: PK `mission_id`。**一意 `(user_id, week_start)`**（1週に1件とした。D-16）。
- インデックス: 上の一意制約のみ。
- RLS: 有効。SELECT `TO authenticated USING ((select auth.uid()) = user_id)`。書き込みポリシーなし。
- GRANT: anon なし／authenticated `SELECT`／service_role 全操作。
- `far_from_home`（自宅から500m以上先）はサーバーが自宅を知らないため判定できない（U-10 → D-16）。

### 3.12 gacha_sessions（ガチャ1回分＝単発 or 10連）【追加】
追加の理由: 10連は1回のコイン消費で10体出るため、「コイン台帳の1行」と「排出10行」を結ぶ単位が要る。台帳から外部キーで参照する。

| 列 | 型 | NULL | 既定 | 制約 | 説明 |
|---|---|---|---|---|---|
| session_id | uuid | NOT NULL | gen_random_uuid() | PK | |
| user_id | uuid | NOT NULL | — | FK → `profiles(user_id)` ON DELETE CASCADE | |
| draw_type | text | NOT NULL | — | `CHECK (draw_type in ('single','ten'))` | 単発／10連 |
| cost | integer | NOT NULL | — | `CHECK (cost > 0)`、`CHECK (draw_type <> 'single' or cost = 100)`、`CHECK (draw_type <> 'ten' or cost = 1000)` | 消費コイン。単発は 100（SPEC）。10連は 1000（D-12、決定 2026-11-05） |
| drawn_at | timestamptz | NOT NULL | now() | — | |

- キー: PK `session_id`。
- インデックス: `(user_id, drawn_at desc)`。
- RLS: 有効。SELECT 本人のみ（`(select auth.uid()) = user_id`）。書き込みポリシーなし。
- GRANT: anon なし／authenticated `SELECT`／service_role 全操作。

### 3.13 gacha_draws（排出1体ごと）
SPEC §8: 確定枠（10連で★4以上1体）・天井（累計30回で★5）の判定に使う。

| 列 | 型 | NULL | 既定 | 制約 | 説明 |
|---|---|---|---|---|---|
| draw_id | uuid | NOT NULL | gen_random_uuid() | PK | |
| session_id | uuid | NOT NULL | — | FK → `gacha_sessions(session_id)` ON DELETE CASCADE | |
| user_id | uuid | NOT NULL | — | FK → `profiles(user_id)` ON DELETE CASCADE | RLS と天井計算のため持つ |
| position | smallint | NOT NULL | — | `CHECK (position between 1 and 10)` | セッション内の順番（単発は 1） |
| user_pull_no | integer | NOT NULL | — | `CHECK (user_pull_no >= 1)` | そのユーザーの累計の通し番号（1, 2, 3, …）。天井カウンタの元 |
| character_id | smallint | NOT NULL | — | 複合 FK `(character_id, rarity)` → `characters(character_id, rarity)` ON DELETE RESTRICT | rarity が NULL の初回キャラは参照できない＝ガチャからは出ない |
| rarity | smallint | NOT NULL | — | `CHECK (rarity between 3 and 5)` | 排出時のレア度（キャラと一致することを複合 FK で保証） |
| guarantee | text | NOT NULL | 'none' | `CHECK (guarantee in ('none','ten_floor','ceiling'))` | 通常抽選／10連の★4以上確定枠／天井の★5確定 |

- キー: PK `draw_id`。一意 `(session_id, position)`。**一意 `(user_id, user_pull_no)`**（同時に2回ガチャを回しても通し番号が衝突して片方が失敗する＝天井の二重取りを防ぐ）。
- インデックス: 上の一意制約（user_id 先頭で「最後の★5 以降の回数」を引ける）。
- 基本設計の `pity_count` は、リセット条件が未定（N-07）のため列にせず `user_pull_no` と `rarity` から導出する（★5 で戻す場合も戻さない場合もこの2列で計算できる）。D-12。
- RLS: 有効。SELECT 本人のみ。書き込みポリシーなし。
- GRANT: anon なし／authenticated `SELECT`／service_role 全操作。
- 確率（70/25/5）は DB に持たない（抽選は Edge Functions）。

### 3.14 user_characters（所持キャラ）
SPEC §8。

| 列 | 型 | NULL | 既定 | 制約 | 説明 |
|---|---|---|---|---|---|
| user_id | uuid | NOT NULL | — | FK → `profiles(user_id)` ON DELETE CASCADE | |
| character_id | smallint | NOT NULL | — | FK → `characters(character_id)` ON DELETE RESTRICT | |
| obtained_at | timestamptz | NOT NULL | now() | — | 初めて入手した時刻 |
| duplicate_count | integer | NOT NULL | 0 | `CHECK (duplicate_count >= 0)` | 2体目以降に引いた回数。変換先は未定（N-07 → D-13） |

- キー: PK `(user_id, character_id)`。
- インデックス: PK のみ。
- 初回キャラはここに入れない（profiles.starter_character_id で持つ。D-09）。
- RLS: 有効。SELECT 本人のみ。書き込みポリシーなし。
- GRANT: anon なし／authenticated `SELECT`／service_role 全操作。

### 3.15 coin_ledger（グルメコインの台帳）
SPEC §8（付与: チェックイン 30／気配の店 +10 で 40／週ミッション 100／町制覇 100。ガチャ1回 100）。残高＝合計（キャッシュ列は持たない。4.2 のビュー）。

| 列 | 型 | NULL | 既定 | 制約 | 説明 |
|---|---|---|---|---|---|
| entry_id | uuid | NOT NULL | gen_random_uuid() | PK | |
| user_id | uuid | NOT NULL | — | FK → `profiles(user_id)` ON DELETE CASCADE | |
| reason | text | NOT NULL | — | `CHECK (reason in ('checkin','hint_bonus','weekly_mission','town_conquest','gacha'))` | |
| amount | integer | NOT NULL | — | 下の「金額の CHECK」 | 付与は正、消費は負 |
| checkin_id | uuid | NULL | — | FK → `checkins(checkin_id)` ON DELETE CASCADE | reason が checkin / hint_bonus のとき |
| weekly_mission_id | uuid | NULL | — | FK → `weekly_missions(mission_id)` ON DELETE CASCADE | reason が weekly_mission のとき |
| town_id | text | NULL | — | 複合 FK `(user_id, town_id)` → `town_conquests(user_id, town_id)` ON DELETE CASCADE | reason が town_conquest のとき |
| gacha_session_id | uuid | NULL | — | FK → `gacha_sessions(session_id)` ON DELETE CASCADE | reason が gacha のとき |
| created_at | timestamptz | NOT NULL | now() | — | |

- 気配の店へのチェックイン（40）は **2行**（`checkin` 30 と `hint_bonus` 10）で記録する。
- 金額の CHECK（D-11）:
  ```
  (reason = 'checkin'        and amount = 30)
  or (reason = 'hint_bonus'     and amount = 10)
  or (reason = 'weekly_mission' and amount = 100)
  or (reason = 'town_conquest'  and amount = 100)
  or (reason = 'gacha'          and amount < 0)
  ```
  ガチャの金額が `-gacha_sessions.cost` と一致することは表をまたぐため CHECK では保証できず、4.4 の DB 関数で保証する。
- 参照列の CHECK（理由と参照先の対応。ちょうど1つだけ埋まる）:
  ```
  (checkin_id is not null)        = (reason in ('checkin','hint_bonus'))
  and (weekly_mission_id is not null) = (reason = 'weekly_mission')
  and (town_id is not null)           = (reason = 'town_conquest')
  and (gacha_session_id is not null)  = (reason = 'gacha')
  ```
- 二重付与を防ぐ一意制約:
  - 一意 `(checkin_id, reason) WHERE checkin_id is not null`（1チェックインにつき checkin 1行・hint_bonus 1行まで）
  - 一意 `(weekly_mission_id) WHERE weekly_mission_id is not null`
  - 一意 `(user_id, town_id) WHERE town_id is not null`
  - 一意 `(gacha_session_id) WHERE gacha_session_id is not null`
- インデックス: `(user_id, created_at desc)`（履歴・残高）、上の部分一意インデックス（外部キーの CASCADE にも使われる）。
- 残高がマイナスにならないことは、4.4 の DB 関数で「本人の profiles 行をロック → 合計を確認 → 挿入」を1トランザクションで行って保証する。
- RLS: 有効。SELECT 本人のみ。書き込みポリシーなし。
- GRANT: anon なし／authenticated `SELECT`／service_role 全操作。

### 3.16 record_snapshots（週次の記録）
S6、N-11。**地図画像・セルの一覧は持たず、数字だけ**（D-18）。

| 列 | 型 | NULL | 既定 | 制約 | 説明 |
|---|---|---|---|---|---|
| user_id | uuid | NOT NULL | auth.uid() | FK → `profiles(user_id)` ON DELETE CASCADE | ブラウザからは送らない |
| week_start | date | NOT NULL | — | — | どの週の記録か。「◯週目」は record_started_at からの差で表示側が計算する |
| cleared_ratio | numeric(5,4) | NOT NULL | — | `CHECK (cleared_ratio between 0 and 1)` | 開拓率（自宅 1km 円内のセルのうち晴れた割合）。自宅座標が要るためブラウザが計算する |
| shop_count | integer | NOT NULL | — | `CHECK (shop_count >= 0)` | その週の終わり時点の訪問軒数 |
| quest_count | integer | NOT NULL | — | `CHECK (quest_count >= 0)` | その週の終わり時点の達成クエスト数（気配＋週ミッション） |
| created_at | timestamptz | NOT NULL | now() | — | |

- キー: PK `(user_id, week_start)`。
- インデックス: PK のみ。
- 開拓率は比率だけで位置を含まないため、自宅は推定できない。ただし本人が値を書き換えられる（自分の記録が狂うだけで他人やコインには影響しない）。
- RLS: 有効。
  - SELECT `TO authenticated USING ((select auth.uid()) = user_id)`
  - INSERT `TO authenticated WITH CHECK ((select auth.uid()) = user_id)`
  - UPDATE / DELETE のポリシーなし（作ったら変えない。D-18）
- GRANT: anon なし／authenticated `SELECT`、`INSERT (week_start, cleared_ratio, shop_count, quest_count)`／service_role 全操作。
- 地図のスナップショットは、表示時にブラウザが fog_cells の `cleared_at`＋端末内のルートセル（チェックイン時刻で絞る）から再描画する。

### 3.17 badges（バッジ・称号のマスタ）【追加】
- 出典: **ユーザー決定 2026-11-05、SPEC 未反映**。実績でもらえるバッジ。具体的な獲得条件と表示場所は未決定。SPEC に関係する記述は §8「ダブりは色違い・称号などに化ける」の一文のみで、この表との関係は決めない（D-30）。
- 条件の定義用の列は作らない（判定ロジックは本書の範囲外。決まったら Edge Functions 側に置く）。

| 列 | 型 | NULL | 既定 | 制約 | 説明 |
|---|---|---|---|---|---|
| badge_id | smallint | NOT NULL | — | PK、`CHECK (badge_id > 0)` | characters と同じく番号で管理する |
| code | text | NOT NULL | — | 一意、`CHECK (code ~ '^[a-z0-9_]+$')` | プログラムから参照する識別子（例の値は条件が決まってから付ける） |
| name | text | NOT NULL | — | `CHECK (btrim(name) <> '')` | 表示名 |
| description | text | NULL | — | — | 説明文 |
| icon_path | text | NULL | — | — | アイコン画像の置き場所（`public/` 配下の相対パス想定）。**素材を受け取るまで NULL**（D-29） |
| sort_order | smallint | NOT NULL | 0 | — | 一覧の並び順 |
| created_at | timestamptz | NOT NULL | now() | — | |

- キー: PK `badge_id`、一意 `code`。
- インデックス: PK と一意制約のみ。
- RLS: 有効。SELECT `TO authenticated USING (true)`（characters と同じ。anon は含めない。D-28）。書き込みポリシーなし。
- GRANT: anon なし／authenticated `SELECT`／service_role 全操作。
- seed: 条件・名前が未決定のため **行を入れない**（6章）。

### 3.18 user_badges（バッジの獲得記録）【追加】
- 出典: ユーザー決定 2026-11-05、SPEC 未反映。

| 列 | 型 | NULL | 既定 | 制約 | 説明 |
|---|---|---|---|---|---|
| user_id | uuid | NOT NULL | — | FK → `auth.users(id)` ON DELETE CASCADE | 指示どおり auth.users を直接参照（他のユーザー所有テーブルは profiles 参照。退会時はどちらでも消える。D-28） |
| badge_id | smallint | NOT NULL | — | FK → `badges(badge_id)` ON DELETE RESTRICT | |
| earned_at | timestamptz | NOT NULL | now() | — | 獲得時刻 |

- キー: PK `(user_id, badge_id)`（同じバッジは1回だけ）。
- インデックス: PK のみ。
- RLS: 有効。SELECT `TO authenticated USING ((select auth.uid()) = user_id)`。INSERT/UPDATE/DELETE のポリシーなし（改ざん防止のため付与は Edge Functions＝service_role のみ）。
- GRANT: anon なし／authenticated `SELECT`／service_role 全操作。

### 3.19 自宅座標を持たないことの確認（2.5）
| テーブル | 位置に関係する列 | 判定 |
|---|---|---|
| profiles | なし | OK |
| shops | lat, lng（店の位置） | OK（店の位置。検索の中心は保存しない） |
| towns | boundary, min/max_lat/lng（町の形） | OK |
| checkins | なし（現在地を持たない） | OK |
| fog_cells | cell_x, cell_y（店周り・町のセル） | OK（ルート由来は保存しない。グリッドの原点は固定） |
| daily_hints | なし（方角・距離を持たない） | OK |
| weekly_missions | condition_params | OK（基準点を入れないことを本書で禁止） |
| record_snapshots | cleared_ratio（比率） | OK |
| badges / user_badges | なし | OK |
| その他 | なし | OK |

残る推定リスク（DB の列ではなくデータの性質）: チェックインした店の分布や店周りのセルからは、生活圏はおおよそ分かる。これは S8（記録をサーバーに保存する）・S12 の決定から来るもので、本書では「正確な自宅座標・自宅起点のルートは置かない」までを守る。

---

## 4. ビュー・関数・トリガー

### 4.1 public_profiles（他人に見せるニックネーム）
基本設計 3.4「他人には nickname のみ」の実現方法。

- 方式: **security definer のビュー**（`security_invoker = false`）に `security_barrier = true` を付け、列を `user_id, nickname` だけに絞る。対象行は「非表示でない感想を1件以上持つユーザー」だけにする。
  ```
  create view public.public_profiles
    with (security_invoker = false, security_barrier = true) as
  select p.user_id, p.nickname
  from public.profiles p
  where exists (
    select 1 from public.reviews r
    where r.user_id = p.user_id and r.hidden = false
  );
  ```
- 所有者: migration を実行する `postgres`（テーブルの所有者なので profiles の RLS を通らずに読める＝他人の行も返せる）。
- GRANT: anon なし／authenticated `SELECT`／service_role `SELECT`。`REVOKE ALL ... FROM PUBLIC, anon` を明示する。
- 他の方式を選ばなかった理由:
  - security invoker のビュー: 呼び出した人の権限で profiles の RLS が効くため、他人の行が見えない（目的を果たせない）。
  - profiles の列単位 GRANT（`SELECT (user_id, nickname)` ＋ 全員読める RLS）: 本人も自分の `starter_character_id` 等を読めなくなり、本人用に別の仕組みが要る。また全ユーザーのニックネームが一覧できてしまう。
  - テーブル分割: テーブルが増え、初回設定の書き込みが2か所になる。
- definer ビューの注意（Supabase linter が `security_definer_view` として警告する。意図した例外として扱う）:
  - RLS を素通りするので、**列は明示的に列挙し `select *` にしない**（profiles に列を足しても漏れない）。
  - 将来 profiles に秘密寄りの列を足しても、このビューは変えない。
  - `security_barrier` で、WHERE で外した行（感想を書いていない人）が関数の副作用経由で漏れるのを防ぐ。
- 使い方: お店詳細で感想を取るとき `reviews` と `public_profiles` を user_id で突き合わせる。PostgREST の埋め込みが効かなければ2回に分けて取る。

### 4.2 coin_balances（コイン残高）
- 方式: **security invoker のビュー**（`security_invoker = true`）。呼び出した人の RLS が coin_ledger に効くので本人の行だけが集計される。
  ```
  create view public.coin_balances with (security_invoker = true) as
  select user_id, sum(amount)::bigint as balance
  from public.coin_ledger group by user_id;
  ```
- 台帳が0行のユーザーは行が返らないので、ブラウザは「行なし＝0」として扱う。
- GRANT: anon なし／authenticated `SELECT`（下の coin_ledger の SELECT も必要。付与済み）／service_role `SELECT`。

### 4.3 updated_at トリガー
- 対象: `profiles`、`reviews`（本人が更新できるテーブルだけ）。
- 関数 `public.set_updated_at()`（`returns trigger`、`language plpgsql`、`set search_path = ''`、本体は `new.updated_at := now(); return new;`）。
- トリガー: `before update on ... for each row execute function public.set_updated_at()`。
- `REVOKE EXECUTE ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated`（トリガーの発火には呼び出し側の EXECUTE は要らない。実装時に動作を確認する）。

### 4.4 改ざん防止の書き込みを1トランザクションで行う DB 関数（D-23）
supabase-js（PostgREST 経由）は複数の書き込みを1トランザクションにできないため、チェックイン確定とガチャは **DB 関数を Edge Functions から RPC で呼ぶ** 形にする。抽選（乱数）と距離判定は Edge Functions の TypeScript 側で行い、DB 関数は「ロック・整合性の確認・まとめて書く」だけを担う。

| 関数（名前は仮） | 中でやること | 呼ぶ人 |
|---|---|---|
| `app_apply_checkin(p_user_id uuid, p_shop_id text, ...)` | profiles 行を `FOR UPDATE` でロック → daily_hints を見て was_hint を決める → checkins 挿入 → coin_ledger（30、気配なら +10）→ daily_hints.completed_checkin_id 更新 → 週ミッションの progress 更新と達成時の +100 → 町制覇判定と town_conquests・+100 → fog_cells（店周り・町）挿入 | Edge Functions（service_role） |
| `app_apply_gacha(p_user_id uuid, p_draw_type text, p_cost integer, p_expected_last_pull_no integer, p_results jsonb)` | profiles 行をロック → 最新の user_pull_no が `p_expected_last_pull_no` と一致するか確認（不一致なら例外。Edge が読み直して再抽選）→ 残高 ≥ cost を確認 → gacha_sessions・gacha_draws・coin_ledger（-cost）・user_characters（新規 or duplicate_count+1）を挿入 | Edge Functions（service_role） |

- 共通: `security invoker`、`set search_path = ''`（中のテーブル名はスキーマ付きで書く）。
- GRANT: `REVOKE EXECUTE ... FROM PUBLIC, anon, authenticated` → `GRANT EXECUTE ... TO service_role` のみ。ブラウザから RPC で直接呼べないようにする。
- 引数の細部・戻り値は Edge Functions の詳細設計で決める。代替案（Edge Functions から `SUPABASE_DB_URL` で直接接続してトランザクションを張る）は D-23。
- 気配・週ミッションの生成（単純な挿入）は1トランザクションでなくてもよいが、同じ日の二重生成は一意制約（3.10・3.11）が防ぐ。

---

## 5. Storage（感想の写真）

### 5.1 bucket
- bucket id／name: `review-photos`
- `public = false`（**非公開**。読みはログインユーザーだけ。D-20）
- `file_size_limit`: 300KB（SPEC §3.1 の圧縮目標 150〜250KB に余裕を少し持たせた値。D-20）
- `allowed_mime_types`: `image/jpeg`, `image/webp`（圧縮後の形式は未定のため2つ。D-20）
- migration に bucket の作成（`storage.buckets` への insert）とポリシーを含める。

### 5.2 オブジェクト名と storage.objects のポリシー
- オブジェクト名: `{auth.uid()}/{ランダムな uuid}.{jpg|webp}`。reviews.photo_path にはこのオブジェクト名を入れる。
- ポリシー（すべて `TO authenticated`、対象 `storage.objects`）:
  - SELECT: `bucket_id = 'review-photos' AND ((storage.foldername(name))[1] = (select auth.uid())::text OR exists (select 1 from public.reviews r where r.photo_path = storage.objects.name and r.hidden = false))`
    - 自分のフォルダ、または非表示でない感想に付いている写真だけ読める（管理者が非表示にした感想の写真は他人から読めなくなる）。
  - INSERT: `WITH CHECK (bucket_id = 'review-photos' AND (storage.foldername(name))[1] = (select auth.uid())::text)`
  - DELETE: `USING (bucket_id = 'review-photos' AND (storage.foldername(name))[1] = (select auth.uid())::text)`
  - UPDATE: ポリシーなし（上書き・upsert をさせない。写真を替えるときは新しい名前で上げて古いものを消す）
- anon 向けポリシーなし。
- 表示: ブラウザは `createSignedUrl` で期限付き URL を作って `<img>` に使う（非公開 bucket のため公開 URL は使えない）。
- 写真の再エンコードで撮影位置などのメタデータが残らないことの確認は基本設計 7.2 のとおり（DB 側ではなく圧縮処理の確認項目）。

### 5.3 Storage の権限についての確認事項
- auto-expose OFF は `public` スキーマのテーブルに関する設定で、Storage API の動作は storage.objects のポリシーで決まる想定。実装時に、上のポリシーだけでアップロード・署名 URL 作成・削除ができることを確認する。

### 5.4 写真が消えるタイミング
- 感想の削除・写真の差し替え: SQL の CASCADE では Storage のファイルは消えない。ブラウザが reviews の更新・削除の後に `storage.remove([path])` を呼ぶ。失敗して残ったファイル（孤立ファイル）の掃除は運用の要確認（D-21）。
- 退会（U-12）: Edge Functions（service_role）が次の順で行う。
  1. Storage API で `review-photos/{uid}/` 配下を一覧して全削除（SQL で storage.objects の行を消してもファイルは消えないので、必ず Storage API を使う）
  2. `auth.admin.deleteUser(uid)` → `auth.users` の削除が CASCADE で profiles と全テーブルの本人の行を消す
  - 退会した人が付けた通報（review_reports）も消える。退会した人の感想に付いていた他人の通報も感想と一緒に消える（D-24）。

---

## 6. 初期データ（seed）

### 6.1 characters
migration に含める（ガチャと初回設定は、このデータが無いと動かない）。**名前は入れない**（SPEC に表示名が無いため。D-10）。

| character_id | pool | rarity | name | sprite_path |
|---|---|---|---|---|
| 1〜4 | gacha | 5 | NULL | NULL |
| 5〜12 | gacha | 4 | NULL | NULL |
| 13〜30 | gacha | 3 | NULL | NULL |
| 101 | starter | NULL | NULL | NULL |
| 102 | starter | NULL | NULL | NULL |

- 101／102 のどちらが男の子・女の子かは決めない（画面側の表示で使う対応表として未決定。D-09）。
- 名前・スプライトの置き場所は、キャラの採用・歩行シート化が進んだら別の migration で UPDATE する。
- **seed にダミーの画像パス・外部 URL・プレースホルダ画像を入れない**（CLAUDE.md の追加ルール: 素材はシロ（Muse）が作る）。sprite_path はシロから素材を受け取った後に登録する（D-29）。

### 6.2 その他
- badges: 獲得条件・名前が未決定のため seed しない（行を入れない）。icon_path も同様に素材の受け取り後に登録する（D-29）。
- towns: 境界データの出典が未決定（N-09）のため seed しない。取り込みスクリプトで入れる。
- shops: Edge Functions が実行時に入れる。seed しない。

### 6.3 シロへの素材依頼（案）
DB の画像パス列に入る素材のうち、設計から仕様が分かる範囲をまとめた。分からない項目は「未決定」とした。依頼の確定はユーザーが行う。

| 素材 | 用途 | 内容 | サイズ・形式 | 画風 | 根拠 |
|---|---|---|---|---|---|
| キャラのスプライトシート（ガチャ候補 1〜30） | `characters.sprite_path`。アバター表示 | 上下左右4方向 × 歩行コマ＋待機ポーズ。歩行に小さな上下動。1秒8コマ目安 | 1コマの画素数・コマ数・ファイル形式は未決定（アバター描画方式 N-16 の結論で決まる） | 1番（星降るキリン）の柔らかい水彩風パステル。目は大きさ維持・柔らかい楕円ハイライト1つ＋下半分の薄い反射光。食べ物モチーフは小物・持ち物で表現 | SPEC §8「アバターは2Dスプライト・4方向」「キャラデザイン試作と採用」 |
| 初回キャラのスプライトシート（男の子・女の子の2体、ID 101・102） | 同上 | 同上（人型） | 未決定（同上） | 未決定（ガチャキャラと同じ画風にするかは SPEC に無い） | SPEC §8「最初のキャラは男の子と女の子の2体から選ぶ」「メイン画面のアバターは人」 |
| バッジのアイコン | `badges.icon_path` | バッジの種類が未決定のため内容は未決定 | 未決定 | 未決定（世界観は「明るい昼のグルメ」、UI はフラット寄り。CLAUDE.md） | ユーザー決定 2026-11-05（SPEC 未反映） |

- 店の公式写真（shops.photo_url）はホットペッパー由来、感想の写真は利用者が撮るため、シロへの依頼の対象外。

---

## 7. 要確認事項一覧

| ID | 内容 | 選んだ案（保守的な既定） | 理由 | 関係 |
|---|---|---|---|---|
| D-01 | 他人へのニックネームの見せ方 | definer ビュー `public_profiles`（user_id, nickname のみ、security_barrier、感想を書いた人だけ、authenticated のみ） | invoker ビューでは他人の行が見えず、列 GRANT では本人の列も読めなくなる。対象を感想の投稿者に絞って一覧化を防ぐ | 基本設計 3.4、S13 |
| D-02 | 感想（と写真）を anon（未ログイン）にも見せるか | **【決定 2026-11-05 ユーザー】見せない（authenticated のみ）**。SPEC S12「みんなが見れる」は「アプリの利用者みんな」と解釈 | アプリはログイン必須。後で公開範囲を広げるのはポリシー追加で済むが、逆は難しい | S12、基本設計 3.4 |
| D-03 | 感想は1チェックインに1件か、1店に1件か | 1チェックインに1件（`checkin_id` 一意） | S14「1回の感想に1枚」「複数回行った店は最新の訪問の写真」と合う。図鑑の「ひとこと」は感想本文と同じとみなした | N-06 |
| D-04 | 星の範囲・本文の必須と上限 | 星 1〜5 必須、本文は任意・500文字以内 | SPEC に数値が無い。上限は荒らし対策として最小限に置いた | S12 |
| D-05 | ニックネームの「10文字」の数え方 | `char_length`（Unicode のコードポイント数）で 1〜10、空白だけは不可 | 絵文字の結合文字は複数文字に数えられ、画面の見た目の文字数とずれる場合がある | S15 |
| D-06 | 霧セルのサーバー保存範囲 | **【決定 2026-11-05 ユーザー】** 店周り 200m と町制覇のセルだけ保存（`source` に route を許さない）。ルート由来は端末内だけ。機種変更時は自宅を再設定したあと、checkins の履歴から OSRM でルートを引き直して作り直す（自宅を引っ越した場合は新しい自宅からの引き直しになる割り切り）。グリッドは地球全体で固定の原点 | ルート由来のセルは自宅が推定できる。店周り・町は checkins から分かる情報と同じ。代案: fog_cells を作らず毎回 checkins から再計算 | U-08、S8 |
| D-07 | チェックイン時の現在地を保存するか | 保存しない（判定後に捨てる。ログにも出さない） | 判定後に使い道が無く、生活圏の推定材料になる | U-08、基本設計 6.1 |
| D-08 | 地理データの持ち方 | PostGIS なし。緯度経度は double precision、町の形は GeoJSON（jsonb）＋外接矩形。店の町割り当ては取り込み時／Edge で計算 | 基本設計が地理型を必須としていない。距離判定は 50m・200m 程度でアプリ側計算で足りる | U-03、N-09 |
| D-09 | 初回キャラ（男の子・女の子）の持ち方 | characters に `pool='starter'`、rarity NULL、ID は仮に 101・102。user_characters には入れない | SPEC の 1〜30 は「動物×食べ物」のガチャ候補で、初回の人型キャラとは別と読んだ。ID と男女の対応は未決定 | SPEC §8 |
| D-10 | キャラの seed に名前を入れるか | 入れない（id・pool・rarity のみ）。採用済み4体（14 クッキーくま／24 ゼリーくらげ／26 みたらし団子うさぎ／29 ポップコーンきつね）も名前は NULL | SPEC の呼び名がモチーフ説明か表示名か不明。ダミー名を作らない | SPEC §8 キャラデザイン |
| D-11 | コインの金額を DB の CHECK に固定するか | 固定する（checkin=30、hint_bonus=10、weekly_mission=100、town_conquest=100、gacha は負） | 改ざんや実装ミスで金額がずれないように。数値を変えるときは migration が要る | SPEC §8 |
| D-12 | ガチャの細部（10連の価格、天井のリセット条件、確定枠と天井の重なり） | **【決定 2026-11-05 ユーザー】** 10連は 1000 コイン（割引なし。`CHECK (draw_type <> 'ten' or cost = 1000)`）。天井カウンタは自然排出を含め★5 が出たら 0 に戻す（＝最後の★5 から30回以内に必ず1体。`user_pull_no` と rarity から導出）。10連で天井の★5 が出たら、それが★4以上の確定枠も兼ねる（自然に★4以上が出た場合も確定枠は追加しない）。抽選ロジックは Edge Functions | SPEC に数値・規則が無い | N-07 |
| D-13 | ダブりの変換先 | **【決定 2026-11-05 ユーザー】ダブりはキャラ図鑑の「レベル」と光り方で表す。** Lv ＝ 所持数（1体目が Lv1、ダブるたびに +1）、上限 Lv5。Lv が上がるほどカードが段階的に光る（案: Lv2 うっすら、Lv3 キラキラ、Lv5 シールのホログラム風。段階ごとの見た目は画面の詳細設計で決める）。Lv5 を超えたダブりは数だけ数える。DB は `duplicate_count` のまま（Lv は 1 + duplicate_count を 5 で頭打ちにして画面側で導出。列・テーブルの追加なし）。色違い・称号への変換は作らない | SPEC §8「化ける形」を図鑑の中で育つ形として具体化。光りのエフェクトに画像素材が要る場合はシロへ依頼（CLAUDE.md）。SPEC への追記は未 | N-07 |
| D-14 | 町制覇の記録と分母 | town_conquests を追加して1町1回だけ +100。分母は shops キャッシュ内の同じ町の店数。一度制覇したら取り消さない | 導出だけでは二重付与を防げない。分母はキャッシュの範囲に依存する点を確認したい | S2 ③、N-09、N-10 |
| D-15 | 同じ店への繰り返しチェックインでコインがもらえるか（回数・間隔の制限） | **【決定 2026-11-05 ユーザー】同じ店のコインは1日1回まで**。チェックインと記録は何度でも可。checkins.reward_day ＋部分一意 `(user_id, shop_id, reward_day)` で担保 | 再訪の記録は残しつつ連打でのコイン増殖を防ぐ。残り: 日の区切り時刻（N-08 / D-19）。SPEC への追記は未 | S3、SPEC §8 |
| D-16 | 週ミッションの件数・数え方 | **【決定 2026-11-05 ユーザー】「自宅から500m以上先」は端末の申告。チェックイン時に端末が自宅からの距離を計算し、真偽だけを送る（checkins.far_from_home。距離・座標は送らない）。** 以下は残りの論点: 1週に1件（一意 `(user_id, week_start)`）、target 既定 3。「3軒」が別の店か同じ店の再訪も数えるか、「同じ町で2軒」と目標3軒の関係は未決定。`far_from_home` はサーバーが自宅を知らないため判定方法が未決定（端末の申告にするか、プールから外すか） | SPEC は「条件プールから抽選、週3軒」まで | S4、S15、U-10 |
| D-17 | 気配・週ミッションの生成の入力と、気配の店名の秘匿 | **【決定 2026-11-05 ユーザー】気配は「端末が候補、サーバーが抽選」。端末が自宅1kmの霧の中の未訪問店（圏外では現在地周りも）の shop_id リストを送り、Edge Functions が未訪問を確認してランダムに3件選び daily_hints に保存。店名は端末の画面で伏せるだけ（N-04）。生成のタイミングは「その日に初めてアプリを開いたとき」の1回（PWA は裏で動けず、サーバーは自宅を知らないため定期生成はしない）。地図表示は待たせず裏で取得し、届くまで探索シートに「気配を探しています…」。同じ日の2回目以降は保存済みの daily_hints を読むだけ。** 当初案: 書き込みは Edge Functions のみ。生成の入力に自宅座標を使わない方法は未決定。daily_hints.shop_id と shops.name は本人から読める（店名を端末で伏せるだけ） | U-10 の結論次第。店名をサーバーで伏せるなら daily_hints の列 GRANT と shops の読み取りを変える必要がある | U-10、N-04 |
| D-18 | 週次記録の書き手と中身 | 本人が作成のみ（更新・削除不可）、数字だけで地図画像は持たない | 開拓率は自宅座標が要るのでサーバーでは計算できない。画像は自宅周りのルートが写り込む | N-11、U-08、S6 |
| D-19 | 日・週の区切り | 列は date 型。JST 何時で切るか・週の始まりの曜日は Edge Functions 側で決める（DB に CHECK なし） | SPEC に無い | N-08 |
| D-20 | 写真の bucket の設定 | **【決定 2026-11-05 ユーザー】** 非公開 bucket、ログインユーザーだけ読める（自分のフォルダか非表示でない感想の写真のみ）、署名付き URL、上限 300KB、jpeg/webp | 基本設計 3.4 は「公開」だが、感想を authenticated のみ（D-02）にしたので揃えた。非表示の感想の写真も隠せる | S14、基本設計 3.4、U-06 |
| D-21 | 孤立した写真ファイルの掃除 | 自動の掃除はしない（感想の削除時にブラウザが消す） | 失敗時に残る。無料枠の容量に影響が出たら手動で掃除する | 基本設計 7.3、U-07 |
| D-22 | shops を参照する外部キーの ON DELETE | RESTRICT（店キャッシュを消すとチェックイン・感想が消える事態を防ぐ） | ホットペッパーの規約で保存期間の制限がある場合（N-10）、店を消せず衝突する | N-10 |
| D-23 | 複数テーブルの書き込みを1トランザクションにする手段 | DB 関数（EXECUTE は service_role のみ）を Edge Functions から RPC で呼ぶ。抽選・距離判定は Edge 側 | supabase-js 単体ではトランザクションが張れない。代案は Edge から DB に直接接続（接続文字列の扱いが増える） | U-11 |
| D-24 | 感想が消えたときの通報 | CASCADE で一緒に消える | 退会で本人の感想が消える（S13）のと揃えた。管理者が通報の履歴を残したいなら変更が要る | S13、U-12、U-13 |
| D-25 | 記録の開始時点（record_started_at） | 初回設定の完了時刻で固定。自宅を変更してもリセットしない | S6 は「自宅設定の完了時点」のみ。変更時の扱いは SPEC に無い | S6、S15 |
| D-26 | アバターとして使うキャラの選択 | 列を作らない（今は初回キャラが常にアバター） | 所持キャラからアバターを替えられるかは SPEC に無い | N-07、SPEC §8 |
| D-27 | 管理者が非表示にした感想を本人に見せるか | 見せる（本人は自分の行を読める。編集・削除も可。非表示の解除は不可） | 本人が状況を把握して削除できるように。見せない方がよければ SELECT ポリシーを `hidden = false` だけにする | S13 |
| D-28 | **バッジ用テーブル（badges・user_badges）を追加した（ユーザーの追加決定 2026-11-05。SPEC 未反映）** | 最小・汎用の2テーブル。条件の列は持たない。badges は characters と同じく authenticated のみ閲覧可（anon は含めない）、user_badges は本人のみ閲覧・書き込みは service_role のみ。user_badges.user_id は指示どおり auth.users を参照（他テーブルは profiles 参照） | 獲得条件・表示場所・付与のタイミングは未決定。SPEC への反映が必要。anon に見せるかは characters と揃えて「見せない」で要確認 | SPEC §8、D-02 |
| D-29 | 画像素材のパス登録 | characters.sprite_path・badges.icon_path は NULL 可。seed にダミーのパス・外部 URL を入れず、**シロ（Muse）から素材を受け取った後にパスを登録する**（UPDATE の migration か管理画面）。依頼内容の案は 6.3 | CLAUDE.md の追加ルール（素材は外部素材・プレースホルダで済ませない）。素材が無い間の画面表示（NULL のときどう見せるか）は画面側の要確認 | SPEC §8 開発時の分担、N-16 |
| D-30 | 称号（バッジ）とダブり変換の関係 | **【決定 2026-11-05 ユーザー】結びつけない。** ダブりの称号バッジは作らない（ダブりは D-13 のレベルと光り方で表す）。バッジ機能（実績で貰えるバッジ）自体は残す | 一度「称号バッジも Cycle 1 から」と決めかけたが、同日中に「キャラ図鑑で光る」案へ変更 | N-07、D-13、D-28 |
