# もぐもGO 初期 DB の適用手順（0001_init.sql）

- 対象ファイル: `supabase/migrations/0001_init.sql`
- 正本: `docs/detailed-design-db.md`
- 作るもの: 18テーブル、ビュー2つ（`public_profiles`・`coin_balances`）、updated_at のトリガー関数 `set_updated_at`、インデックス、CHECK、外部キー、RLS ポリシー、GRANT、Storage の bucket `review-photos` とそのポリシー、`characters` の初期データ（32行）
- 作らないもの: 自宅の座標・自宅の概略位置・自宅からの距離にあたる列（どこにも持たない）。PostGIS。設計 4.4 の `app_apply_checkin` / `app_apply_gacha`（引数が未決定のため後の migration で追加）

---

## 1. 事前の確認

適用する前に、次の3つを確かめてください。

1. **バックアップは無い前提で進める**
   - 無料プランには自動バックアップ（ポイントインタイム復元）がありません。この SQL は空のプロジェクトに初めて入れるものなので、消えて困るデータが無いことを確認してから実行してください。
   - 既に何かテーブルを作っている場合は、先に Table Editor で中身を確認し、必要なら CSV で書き出しておいてください。
2. **初回だけ実行する**
   - このファイルは冪等ではありません（`create table` などに `if not exists` を付けていません）。2回目を実行すると「既に存在する」エラーで止まります（何も壊れませんが、何も適用されません）。やり直したいときは 4.3 を見てください。
3. **auto-expose（API への自動公開）が OFF になっている**
   - ダッシュボードの「Project Settings」→「Data API」（または「API」）で、新しいテーブルを自動で API に公開する設定が OFF になっていることを確認します。
   - この SQL は、権限を GRANT で明示的に付ける前提で書いています。ON のままでも適用はできますが、設計外の権限が付く可能性があるので、OFF にしてから実行してください。
   - SQL の中で、各テーブル・ビューについて一度 `revoke all` してから必要な権限だけを付け直しているので、既定の権限が付いていても最終的には設計どおりになります。

---

## 2. 適用手順

1. ブラウザで Supabase ダッシュボード（https://supabase.com/dashboard）を開き、もぐもGO のプロジェクトを選ぶ。
2. 左メニューの **SQL Editor** を開く。
3. **New query**（新しいクエリ）を押す。
4. エディタで `supabase/migrations/0001_init.sql` を開き、**中身を全部**コピーして SQL Editor に貼り付ける。
   - 先頭の `begin;` から最後の `commit;` まで、全部入っていることを確認してください。一部だけ貼ると途中で止まります。
5. 右下の **Run** を押す（Ctrl+Enter でも可）。
   - 「破壊的な操作を含みます」のような確認が出た場合は、`revoke` を含むためです。内容がこのファイルであることを確かめてから実行してください。
6. 結果欄に `Success. No rows returned` と出れば完了です。

---

## 3. 適用後の確認

### 3.1 Table Editor で見る

1. 左メニューの **Table Editor** を開く。スキーマが `public` になっていることを確認する。
2. 次の18テーブルが並んでいることを確認する。
   `characters`, `profiles`, `towns`, `shops`, `checkins`, `reviews`, `review_reports`, `town_conquests`, `fog_cells`, `daily_hints`, `weekly_missions`, `gacha_sessions`, `gacha_draws`, `user_characters`, `coin_ledger`, `record_snapshots`, `badges`, `user_badges`
3. 各テーブルに「RLS disabled」や「Unrestricted」のような警告表示が**出ていない**ことを確認する（RLS が有効なら出ません）。
4. 左メニューの **Authentication** → **Policies** でも、テーブルごとのポリシーの一覧と RLS の状態を確認できます。

### 3.2 確認用の SELECT

SQL Editor の New query で、次を1つずつ実行してください（読むだけなので何も変わりません）。

**(1) 全テーブルの RLS が有効か**（18行すべて `rowsecurity = true` になるはず）

```sql
select tablename, rowsecurity
from pg_tables
where schemaname = 'public'
order by tablename;
```

**(2) ポリシーの一覧**（public 24件 + storage.objects 3件 = 27件のはず。roles はすべて `{authenticated}`）

```sql
select schemaname, tablename, policyname, cmd, roles
from pg_policies
where schemaname = 'public'
   or (schemaname = 'storage' and tablename = 'objects' and policyname like 'review_photos_%')
order by schemaname, tablename, cmd;
```

**(3) テーブル・ビューの GRANT**（anon の行が1つも無いこと、authenticated は設計どおりであること）

```sql
select table_name, grantee, string_agg(privilege_type, ', ' order by privilege_type) as privileges
from information_schema.role_table_grants
where table_schema = 'public'
  and grantee in ('anon', 'authenticated', 'service_role')
group by table_name, grantee
order by table_name, grantee;
```

- `anon` の行が出ないこと。
- `authenticated` は、`reviews` が `DELETE, SELECT`、`review_reports` は行が出ない（列単位の INSERT だけなので）、それ以外は `SELECT` だけになるはず。
- `service_role` は全テーブルで `DELETE, INSERT, SELECT, UPDATE`、ビュー2つは `SELECT`。

**(4) 列単位の GRANT**（profiles・reviews・review_reports・record_snapshots の INSERT / UPDATE 列）

```sql
select table_name, privilege_type, string_agg(column_name, ', ' order by column_name) as columns
from information_schema.column_privileges
where table_schema = 'public'
  and grantee = 'authenticated'
  and privilege_type in ('INSERT', 'UPDATE')
group by table_name, privilege_type
order by table_name, privilege_type;
```

期待する結果:

| table_name | privilege_type | columns |
|---|---|---|
| profiles | INSERT | nickname, starter_character_id |
| profiles | UPDATE | nickname, starter_character_id |
| record_snapshots | INSERT | cleared_ratio, quest_count, shop_count, week_start |
| review_reports | INSERT | review_id |
| reviews | INSERT | body, checkin_id, photo_path, shop_id, stars |
| reviews | UPDATE | body, photo_path, stars |

**(5) 関数の実行権限**（anon・authenticated が `false` になるはず）

```sql
select has_function_privilege('anon', 'public.set_updated_at()', 'execute') as anon_exec,
       has_function_privilege('authenticated', 'public.set_updated_at()', 'execute') as authenticated_exec;
```

**(6) characters の件数**（合計32件。gacha の★5 が4、★4 が8、★3 が18、starter が2）

```sql
select pool, rarity, count(*)
from public.characters
group by pool, rarity
order by pool, rarity;
```

name と sprite_path がすべて NULL であることも確認します（0件になるはず）。

```sql
select count(*) from public.characters where name is not null or sprite_path is not null;
```

**(7) Storage の bucket**（1行。`public = false`、`file_size_limit = 307200`、`allowed_mime_types = {image/jpeg,image/webp}`）

```sql
select id, name, public, file_size_limit, allowed_mime_types
from storage.buckets
where id = 'review-photos';
```

**(8) 自宅に関係する列が無いこと**（0件になるはず）

```sql
select table_name, column_name
from information_schema.columns
where table_schema = 'public'
  and (column_name ilike '%home%' or column_name ilike '%house%');
```

### 3.3 Security Advisor

1. 左メニューの **Advisors** → **Security Advisor** を開き、更新（Refresh / Rerun linter）する。
2. 期待する結果:
   - `rls_disabled_in_public`（RLS が無効なテーブル）が **出ない**。
   - `function_search_path_mutable` が **出ない**（`set_updated_at` に `search_path` を設定済み）。
   - `security_definer_view` が `public_profiles` に **出る**。これは設計 4.1 で意図した例外です（他人には user_id と nickname だけを、感想を書いた人の分だけ見せるため）。他のビューに出た場合は問題なので報告してください。
3. **Performance Advisor** では「外部キーにインデックスが無い」（unindexed foreign keys）が出る場合があります（例: `gacha_draws` の `character_id, rarity`、`user_characters.character_id`、`town_conquests.town_id`、`user_badges.badge_id`）。設計で決めたインデックスだけを作っているためで、安全上の問題ではありません。件数が増えて遅くなったら設計を見直します。

---

## 4. エラーが出たときの対応

### 4.1 途中まで適用されることはない

ファイル全体を `begin;` 〜 `commit;` で囲んでいるので、**1つでもエラーが出たら全部が取り消されます**（途中まで作られたテーブルが残ることはありません）。エラーの原因を直して、もう一度ファイル全体を Run すれば大丈夫です。

注意: エラーの後に SQL Editor で別の文を実行すると `current transaction is aborted` と出ることがあります。その場合は New query で新しいタブを開いてから実行してください。

### 4.2 よくあるエラー

| エラーの例 | 意味 | 対応 |
|---|---|---|
| `relation "characters" already exists` / `policy "..." already exists` | 既に同じ名前のものがある（2回目の実行、または以前に手で作ったもの） | 何も適用されていません。前回の適用が成功しているなら、やり直す必要はありません（3章で確認）。どうしてもやり直すなら 4.3 |
| `duplicate key value violates unique constraint "buckets_pkey"` | bucket `review-photos` が既にある | ダッシュボードの Storage で既存の bucket を確認する。中身が空なら 4.3 の手順で消してから再実行 |
| `permission denied for table buckets` / `must be owner of table objects` | Storage のテーブルへの権限が足りない | SQL Editor が postgres ロールで動いているか確認する。それでも出る場合は Supabase 側の仕様変更の可能性があるので、ファイルを書き換えずに報告してください |
| `permission denied for schema auth` | `auth.users` への外部キーが作れない | postgres ロールで実行しているか確認。他のロール（ロール切り替え機能）を選んでいたら postgres に戻す |
| `extension "..." does not exist` / `function gen_random_uuid() does not exist` | 標準の関数が使えない | Supabase では通常起きません。プロジェクトの Postgres バージョンを確認して報告してください |
| `syntax error at or near "..."` `LINE 123:` | 構文エラー | 貼り付けが途中で切れていることが多いです。最後が `commit;` で終わっているか確認。`LINE 123` は貼り付けた文の先頭から数えた行番号です（SQL Editor の左の行番号とほぼ一致します）。エディタの行番号と、`0001_init.sql` をエディタで開いたときの同じ行を見比べてください |

### 4.3 2回目の実行が必要なとき（手で掃除する）

> **危険な操作です。** 次の SQL は、もぐもGO のテーブルと**中のデータをすべて消します**。元に戻せません（バックアップがありません）。本当に初期化してよいとき（テストユーザーしかいない、など）だけ実行してください。実行する前に、プロジェクト名が正しいかダッシュボード上部で確認してください。

1. **写真の bucket を消す**: 左メニューの **Storage** → `review-photos` を開き、中のファイルを全部削除してから、bucket を削除する（Storage のファイルは SQL では消せません。SQL で storage のテーブルを直接消すことも Supabase では禁止されています）。
2. **SQL Editor で次を実行する**（これも1トランザクション）。

```sql
-- 危険: もぐもGO のテーブルとデータをすべて消す
begin;

drop policy if exists review_photos_select on storage.objects;
drop policy if exists review_photos_insert_own on storage.objects;
drop policy if exists review_photos_delete_own on storage.objects;

drop view if exists public.coin_balances;
drop view if exists public.public_profiles;

drop table if exists public.user_badges;
drop table if exists public.badges;
drop table if exists public.record_snapshots;
drop table if exists public.coin_ledger;
drop table if exists public.user_characters;
drop table if exists public.gacha_draws;
drop table if exists public.gacha_sessions;
drop table if exists public.weekly_missions;
drop table if exists public.daily_hints;
drop table if exists public.fog_cells;
drop table if exists public.town_conquests;
drop table if exists public.review_reports;
drop table if exists public.reviews;
drop table if exists public.checkins;
drop table if exists public.shops;
drop table if exists public.towns;
drop table if exists public.profiles;
drop table if exists public.characters;

drop function if exists public.set_updated_at();

commit;
```

- `cascade` は付けていません。消えないものがあってエラーになった場合は、設計外のものが依存しているので、無理に消さずに報告してください。
- `auth.users`（ログインしたユーザー）は消えません。ユーザーも消したい場合は **Authentication** → **Users** から手で削除します。
3. 3.2 の (1) を実行して public のテーブルが0件になったことを確認してから、2章の手順で `0001_init.sql` をもう一度実行する。

---

## 5. 適用後の次の作業（この手順書の範囲外）

- **Google ログインの設定**: Authentication → Providers → Google を有効にし、Google Cloud 側の OAuth クライアントを作って Client ID / Secret を登録する。リダイレクト URL（ローカルと Vercel）を Authentication → URL Configuration に登録する。
- **ブラウザ側の接続**: `.env` に `VITE_SUPABASE_URL` と `VITE_SUPABASE_ANON_KEY` を置く（コミットしない）。service_role キーはブラウザ側に絶対に置かない。
- **Edge Functions**: ホットペッパー中継（shops の upsert）、チェックイン確定、ガチャ、気配・週ミッションの生成、退会。ホットペッパーの API キーは Edge Functions のシークレットに置く。
- **DB 関数の追加**: 設計 4.4 の `app_apply_checkin` / `app_apply_gacha` は、Edge Functions の詳細設計で引数・戻り値が決まってから別の migration（`0002_...sql`）で追加する。EXECUTE は service_role だけに付ける。
- **素材の登録**: キャラのスプライト・バッジのアイコンは、シロ（Muse）から受け取った後に別の migration か管理画面でパスを登録する。
- **動作確認**: 設計 5.3 のとおり、ブラウザから写真のアップロード・署名付き URL の作成・削除ができることを確かめる。
