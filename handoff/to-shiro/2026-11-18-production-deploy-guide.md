状態: 対応中（残り 2 つ: 町のデータ・ホットペッパーのキー。下の「残りの 2 つ」）

# 本番デプロイ手順（Claude Code から、ミシェーラへ）

- 日付: 2026-11-18
- 頼んだ人: オーナー（「トークンが切れるから、本番デプロイ手順を渡して。俺ひとりでできるくらい詳細に。Claude Code の作業が必要ないくらいに」）
- お願い: **この手順書をもとに、オーナーが 1 人で本番に出せるよう、チャットで 1 ステップずつ案内してください。** ミシェーラはパソコンを操作できないので、オーナーに操作してもらい、画面のスクリーンショットや出力の文を送ってもらって進めてください。オーナーがつまずいた所は「困ったとき」の表を見てください。
- 先に伝えておくこと: **この手順の途中で出る「キー」「秘密キー」「パスワード」は、チャットに貼らせないでください**（画面に入れるだけ。貼ってほしいのは、公開してよい「Project ref」だけ）。

---

## 0. 前提（Claude Code が済ませてあること）

- アプリの作り直しは全部済んでいます。ブランチ `dev`（開発のサイト https://mogumo-go-dev.vercel.app に出ている）が、本番に出す中身です。**本番ブランチ `main` は `dev` より 906 コミット遅れていて、`dev` を入れても衝突しません**（`main` にだけあるコミットは 0 件）。
- 結合試験（手順 1〜12。ゲストで始めて退会まで）は、手元の Supabase ＋自動のブラウザで全部通っています（`docs/integration-test-2026-11-18.md`）。
- 本番でも **dev と同じ数のお店（地図データのお店＋ホットペッパーのお店）が出る**ように、コードの制限を外してあります（`dev` に入っている）。
- **注意（順番）**: 本番のサイトを先に出すと、本番の Supabase にまだ関数がないので、お店が読めずに失敗します。**必ず「Supabase の準備（手順 1〜5）→ 他サービスの設定（手順 6〜8）→ サイトを出す（手順 9）」の順**で進めます。

## 1. 用意するもの・基本のきまり

- 作業の場所: パソコンの **Ubuntu（WSL）のターミナル**。スタートメニューから「Ubuntu」を開く。開いたら、まず次を打って、プロジェクトのフォルダへ移る:
  ```
  cd ~/mogumo-go
  ```
- ブラウザで開くもの: Supabase（https://supabase.com/dashboard）・Vercel・Cloudflare・GitHub・Google Cloud。
- **Supabase には「開発用」と「本番用」の 2 つのプロジェクトがあります。開発用は `mogumo-go-dev`、本番用は `mogumo-go`。** 画面の左上（プロジェクト名）が **`mogumo-go`** になっていることを、**毎回、操作の前に**確かめる。**前に、関数を本番に置くつもりで開発用に置いて、見つからなかったことがあります。**
- 所要時間の目安: 60〜90 分（町のデータを置く 10〜20 分を含む）。
- 本番のサイト: https://mogumo-go.vercel.app

## 2. 手順 1: 本番の Supabase に、いまどこまで SQL が入っているかを確かめる（1 分）

1. Supabase を開き、**`mogumo-go`（本番）**を選ぶ。
2. 左のメニューの **SQL Editor** →「New query」。
3. 次を全部貼って **Run**:
   ```sql
   select x.m, x.ok from (values
    ('0001', to_regclass('public.profiles') is not null),
    ('0002', exists(select 1 from pg_proc where proname='perform_checkin')),
    ('0003', to_regclass('public.checkins_user_shop_reward_day_uniq') is not null),
    ('0004', to_regclass('public.daily_hints') is not null),
    ('0005', exists(select 1 from information_schema.columns where table_schema='public' and table_name='towns' and column_name='city_name')),
    ('0006', to_regclass('public.weekly_missions') is not null),
    ('0007', exists(select 1 from information_schema.columns where table_schema='public' and table_name='reviews' and column_name='is_public')),
    ('0009', to_regclass('public.login_bonus_claims') is not null),
    ('0010', to_regclass('public.app_status') is not null),
    ('0011', to_regclass('public.notices') is not null),
    ('0012', to_regclass('public.inquiries') is not null),
    ('0013', exists(select 1 from pg_proc where proname='is_guest')),
    ('0014', exists(select 1 from pg_proc where proname='draw_gacha')),
    ('0015', exists(select 1 from public.characters where character_id=1 and name='星降るキリン'))
   ) as x(m, ok) order by 1;
   ```
4. 結果の表の **`ok` が `false` の番号をメモ**する（`true` は入っている）。
   - **`0001` が `false`（またはエラー）**: 本番の土台がありません。**全部**（0001 → 0016）を流す必要があります。
   - 結果が **全部 `true`**: 手順 2 では **0008 と 0016 だけ**流します。

## 3. 手順 2: 足りない SQL を、番号の小さい順に流す（10〜20 分）

SQL のファイルは `supabase/migrations/` にあります。1 本ずつ、中身を全部コピーして、SQL Editor に貼って Run します。

**コピーのしかた（おすすめ）**: Ubuntu のターミナルで、番号を変えて打つと、ファイルの中身が Windows のクリップボードに入ります。そのあと SQL Editor で貼り付け（Ctrl+V）。
```
cd ~/mogumo-go
clip.exe < supabase/migrations/0001_init.sql
```
（番号とファイル名は下の表のとおり）

**流す順番と、流すもの**（手順 1 で `false` だった番号と、下の「必ず流す」を、小さい順に）:

| 番号 | ファイル | いつ流すか |
|---|---|---|
| 0001 | `0001_init.sql` | `false` のとき |
| 0002 | `0002_checkin.sql` | `false` のとき |
| 0003 | `0003_checkin_once_a_day.sql` | `false` のとき |
| 0004 | `0004_daily_hints.sql` | `false` のとき |
| 0005 | `0005_towns.sql` | `false` のとき |
| 0006 | `0006_weekly_missions.sql` | `false` のとき |
| 0007 | `0007_review_visibility.sql` | `false` のとき |
| 0008 | `0008_public_profiles_public_only.sql` | **必ず流す**（何度流しても同じ結果。手順 1 では見分けられないため） |
| 0009 | `0009_login_bonus.sql` | `false` のとき |
| 0010 | `0010_maintenance.sql` | `false` のとき |
| 0011 | `0011_inbox.sql` | `false` のとき |
| 0012 | `0012_contact.sql` | `false` のとき |
| 0013 | `0013_guest.sql` | `false` のとき |
| 0014 | `0014_gacha.sql` | `false` のとき |
| 0015 | `0015_rename_kirin.sql` | `false` のとき（流しても害はない） |
| 0016 | `0016_guest_private_reviews.sql` | **必ず流す**（ゲストが「自分だけ」の感想を書けるようにする。0013 のあとに流す） |

- Run して **「Success」と出れば OK**。赤いエラーが出たら、**そこで止めて**、エラーの文のスクリーンショットを送る（ミシェーラは、その文を読んで案内してください。分からなければ Claude Code への依頼ファイル `handoff/to-claude/` に書く）。
- 全部流したら、手順 1 の確かめの SQL をもう一度流し、`ok` がすべて `true` になることを確かめる。

## 4. 手順 3: ログインの設定（Supabase → Authentication、5 分）

1. 左のメニュー **Authentication**。
2. **Sign In / Providers**（または Settings）: 
   - 「**Allow anonymous sign-ins**」を**オン**（ゲストで始めるのに必要）。
   - 「**Allow manual linking**」を**オン**（ゲストが後から Google をつなぐのに必要）。
   - Google が**オンのまま**であること（すでに設定済みのはず）。
3. **Attack Protection**（または Security）:
   - 「**Enable Captcha protection**」を**オン**。
   - Provider は **Turnstile by Cloudflare**。
   - 「Captcha secret」に **Cloudflare Turnstile の「Secret Key」**を入れる（手順 7 で見る画面のキー。開発用で使っているものと同じウィジェットでよい。**秘密キーはチャットに貼らない**）。
4. **URL Configuration**:
   - Site URL が `https://mogumo-go.vercel.app`。
   - Redirect URLs に `https://mogumo-go.vercel.app/**` が入っている。（11/5 に入れた記録があります。無ければ足す）

## 5. 手順 4: 町の境目のデータを置く（Storage、10〜20 分）

1. 左のメニュー **Storage**。`towns` という名前の入れ物（バケット）があるか見る。
   - **なければ**「New bucket」→ 名前 `towns`、**「Public bucket」はオフのまま**（非公開）→ Create。
   - `review-photos`（非公開）もあること（SQL 0001 で作られる）。
2. `towns` を開く。
3. Windows のエクスプローラーで、次の場所を開く（アドレス欄に貼る）:
   ```
   \\wsl$\Ubuntu\home\otosa\mogumo-go\.towns-out
   ```
   中に **`g` フォルダ**（`index.json` と `…json.gz` の 1,024 個。合計 59MB）があります。
4. **`g` フォルダごと**、ブラウザの `towns` の画面へドラッグして落とす（フォルダの中身ではなく、フォルダそのもの）。
5. アップロードが終わるまで待つ（数分）。終わったら `towns` の中に `g` があり、その中に **`index.json`** が見えれば OK。足りない・止まったときは、もう一度同じように落とす（同じ名前は上書き）。
6. **ポリシー（Policies）は何も足さない**。

## 6. 手順 5: ホットペッパーのキーを入れる（Supabase → Edge Functions、2 分）

1. 左のメニュー **Edge Functions** → **Secrets**（または Manage secrets）。
2. 名前 **`HOTPEPPER_API_KEY`**、値は開発用と同じホットペッパーのキー（Recruit のサイトで確認できる。**キーはチャットに貼らない**）を入れて Save。
3. ほかのキー（`SUPABASE_URL`・`SUPABASE_SERVICE_ROLE_KEY` など）は Supabase が最初から入れているので、足さない。

## 7. 手順 6: 関数 7 本を、本番に置く（Ubuntu のターミナル、10 分）

置く関数: `checkin`・`shops-hotpepper`・`shops-osm`・`daily-hints`・`weekly-missions`・`towns`・`delete-account`（`supabase/functions/` の下に 1 本ずつフォルダがある）。

1. 本番の **Project ref** を調べる: Supabase で **`mogumo-go`（本番）**を開き、左下の歯車 **Project Settings → General** の **「Reference ID」**（20 文字くらいの英数字）。**これは秘密ではない**ので、控えておく。
2. Ubuntu のターミナルで、Supabase にログインする:
   ```
   cd ~/mogumo-go
   npx supabase login
   ```
   ブラウザが開く（または URL が出るので、ブラウザで開く）→ ログイン → 画面に出る確認コードをターミナルに入れる。
3. **本番のプロジェクトを選んでいることを確かめる**:
   ```
   npx supabase projects list
   ```
   一覧の中の **`mogumo-go`（本番）の Reference ID** が、手順 1 で控えたものと同じことを確かめる（`mogumo-go-dev` と取り違えない）。
4. 関数をまとめて置く（`<REF>` を、控えた Reference ID に変える）:
   ```
   npx supabase functions deploy --use-api --project-ref <REF>
   ```
   7 本の名前が順に出て、最後にエラーなく終われば OK。
   - **`--use-api` でエラーが出たら**: Docker Desktop を起動してから、`--use-api` を外して同じコマンドを打つ。
5. **置けたかを確かめる**: Supabase（本番 `mogumo-go`）→ Edge Functions に、**7 本が並んでいる**こと。それぞれ **「Verify JWT」がオン**であること（初期設定のままオンのはず）。
6. **画面で 1 本ずつ置く方法（コマンドが使えないとき）**: 各関数ごとに、Edge Functions → Deploy a new function → Via Editor。**先に関数の名前を変える**（変えないと仮の名前で置かれる）。フォルダの中の**ファイルを全部**（例: `towns` は `index.ts`・`core.ts`・`tiles.ts`）貼る。Verify JWT はオン。

## 8. 手順 7: Cloudflare Turnstile に、本番のドメインを足す（2 分）

1. Cloudflare → **Turnstile** → 使っているウィジェットを開く。
2. **Domains** に **`mogumo-go.vercel.app`** を足して保存。（今は `mogumo-go-dev.vercel.app` と `localhost` だけ。**足さないと、本番で「ゲストではじめる」が失敗します**。）

## 9. 手順 8: Google のログインの設定を確かめる（2 分）

- Google Cloud → API とサービス → 認証情報 → OAuth クライアント **`mogumo-go-web`**。
- 「承認済みの JavaScript 生成元」に **`https://mogumo-go.vercel.app`** があること（11/5 に入れた記録あり。無ければ足す）。

## 10. 手順 9: Vercel の環境変数を確かめて、サイトを出す（10 分）

1. **環境変数（Vercel → プロジェクト `mogumo-go` → Settings → Environment Variables）で、「Production」に次の 3 つがあるか確かめる**:
   | 名前 | 値 |
   |---|---|
   | `VITE_SUPABASE_URL` | **本番**（`mogumo-go`）の Project URL（`https://<ref>.supabase.co`）。**開発用のものになっていないか** |
   | `VITE_SUPABASE_ANON_KEY` | **本番**の anon（publishable）キー。**開発用のものになっていないか** |
   | `VITE_TURNSTILE_SITE_KEY` | Turnstile の **Site Key**（公開してよいキー。**新しく足す**） |
   - 値を直したら、保存だけでは反映されない。サイトを出す（次の 2）ときに新しい値が入る。
2. **サイトを出す（`dev` → `main`）**: ブラウザで GitHub のリポジトリ（`tomo936/mogumo-go`）を開く。
   1. **Pull requests → New pull request**。
   2. **base: `main`** ← **compare: `dev`**。
   3. 「Able to merge」（緑のチェック。衝突なし）と出ることを確かめる → **Create pull request** → **Merge pull request** → **Confirm merge**。
   4. Vercel が自動で本番を作り直す（Vercel → Deployments で、`main` のものが「Ready」になるまで 2〜5 分）。

## 11. 手順 10: 本番を確かめる（iPhone、10 分）

1. iPhone の Safari で https://mogumo-go.vercel.app を開く（**ホーム画面に追加している場合は、アプリを完全に閉じてから開き直す**。古い版が残ることがある）。
2. タイトルの絵が出る → タップ → **「ゲストではじめる」**（ロボット確認が通る）→ ニックネーム → キャラ → 自宅 → 地図。
3. ポコタンの案内が最後まで出る → ログインボーナス +10。
4. 地図に **お店のピン**（ホットペッパーの写真付きの店も）が **dev と同じくらい**出る。経堂などで、dev のサイトと見比べてもよい。
5. 上の「？」で **気配が 3 つ**、下に **今週のミッション**。
6. 近くのお店で 1 軒チェックイン → 紙ふぶき・コインが増える。
7. （別の日でもよい）Google でもログインできる。
8. 設定 → 「データを消してやめる（退会）」で、試したゲストを消す。

## 12. 困ったとき

| 起きたこと | たぶんの原因 | 対処 |
|---|---|---|
| 本番で「ゲストではじめる」が「はじめられませんでした（…）」になる。（ ）の中の文字を見る | `captcha` が入っていれば Turnstile のドメインか、Supabase の秘密キーの入れ間違い | 手順 7（ドメイン）と手順 3（秘密キー）を見直す |
| `422 anonymous_provider_disabled` | 匿名ログインがオフ | 手順 3 で「Allow anonymous sign-ins」をオン |
| `429 over_request_rate_limit` | 短時間に何度も押した | 数分待つ（同じ回線から作りすぎ） |
| お店のピンが出ない・「お店を読み込めませんでした」 | 関数が本番に無い、またはホットペッパーのキーが無い | 手順 6（関数）と手順 5（キー）を確かめる。Supabase → Edge Functions → 関数 → Logs を見る |
| 地図は出るが気配・ミッションが出ない | `daily-hints`・`weekly-missions` が無い、または SQL が足りない | 手順 6、手順 1 の確かめ SQL をもう一度 |
| チェックインできない（「失敗しました」） | `checkin` が無い、SQL 0002/0003 が無い | 手順 6、手順 1 |
| 町のクリアが出ない | `towns` が無い、または `g/index.json` が無い | 手順 4・手順 6 |
| 感想が保存できない（ゲストの「自分だけ」） | SQL 0016 が入っていない | 手順 2 で 0016 を流す |
| 古い画面のまま・新しい絵（タイトル・ボタン）が出ない | ブラウザや、ホーム画面のアプリの古い版 | アプリを完全に閉じて開き直す。Safari なら、更新ボタン長押し → 「再読み込み」 |
| Vercel のビルドが失敗（赤い ✕） | 部品のダウンロード失敗など | Vercel の Deployments → そのビルド → ログの最後の赤い文を読む。`supabase` の名前が出ていたら、Claude Code への依頼ファイルに書く |

**すぐ止めたいとき（メンテナンス画面にする）**: Supabase（本番）→ SQL Editor で
```sql
update public.app_status set maintenance = true, message = 'ただいま調整中です', ends_at = null where id = 1;
```
を Run（アプリが「メンテナンス中」の画面になる）。終わったら `maintenance = false` にして Run。

**前の版に戻したいとき**: Vercel → Deployments → 1 つ前の「Ready」の行の「…」→ **Instant Rollback**（数秒で戻る）。

## 13. 出したあとに、まだ残っていること（急がない）

- 小さい不具合 2 件（文の食い違い）。出したあとで Claude Code に直してもらう:
  1. ポコタンの案内の 8 ページ目が「ガチャを引くと…」（ガチャはまだ準備中）。
  2. ゲストがお問い合わせを送ったあとの文が「メールアドレスにお送りします」（ゲストにはメールアドレスがない）。
- iPhone でホーム画面から開く瞬間に、一瞬、白い画面が出る（iPhone の起動の画面）。直すなら、機種ごとの起動画像（`apple-touch-startup-image`）が要る。
- ガチャは準備中のまま（`GACHA_OPEN = false`。サーバーの SQL でも閉じるかは、総合レビューの H1。`docs/release-review-2026-11-17.md`）。
- 結合試験で試せていないこと: Google ログイン・Google をつなぐ、本物のホットペッパーの店、iPhone の実機の重さ・GPS。
- 規約・プライバシーポリシーの本文は、専門家の確認をしていません（アプリ内の `/terms`・`/privacy`）。出す前にオーナーが読んでください。

## 14. 参考（ファイルの場所）

- この手順の元の下書き: `docs/superpowers/plans/2026-11-18-production-deploy.md`
- 結合試験の結果: `docs/integration-test-2026-11-18.md`
- 引き継ぎメモ: `docs/session-handoff.md`
- 個別の置き方の詳しい記録: `docs/superpowers/plans/`（`2026-11-10-towns-deploy.md` ほか）

## 15. 報告

- 終わったら、この依頼の状態を「完了」にして、`handoff/LOG.md` に 1 行足してください。
- つまずいて進めなくなったときは、`handoff/to-claude/` に、いつ・どの手順・何を押して何が出たか（スクリーンショットのファイル名）を書いてください。

---

## 【2026-11-18 追記】残りの 2 つ（ギルベルトの報告を受けて。ほかは全部済み・本番公開済み）

ギルベルトの報告: 本番 Supabase（`jaypeaejbzkeudwvvrnb`）に SQL・ログイン設定・関数 7 本・Turnstile・Google・Vercel・`dev`→`main`（PR #1）まで済み。https://mogumo-go.vercel.app で公開中。

**いまの本番で起きること**: ホットペッパーのキーが無いので、ホットペッパーのお店が出ない（「お店を読み込めませんでした」が出ることがある。地図データのお店は出る）。町のデータが無いので、町の判定・クリアが動かない。**この 2 つを入れれば完了**。

### A. ホットペッパーのキー（画面で入れる。おすすめ）
- Claude Code はこのキーの値を**知らない**（`.env` は読まない決まり）。開発用の Supabase の Secrets も値は見えない（伏せ字）。
- キーの探し方（どれか）: ① リクルート WEB サービスに登録したときのメール（件名に「APIキー」など）② https://webservice.recruit.co.jp/ でもう一度登録すると、すぐ新しいキーがメールで届く（無料・数分）③ パソコンの `\\wsl$\Ubuntu\home\otosa\mogumo-go\.env` をメモ帳で開き、`HOTPEPPER` の行があれば、その値（無ければ ① か ②）。
- 入れ方: Supabase → **本番 `mogumo-go`**（左上の名前を確かめる）→ Edge Functions → **Secrets** → 名前 `HOTPEPPER_API_KEY`・値 = キー → Save。**チャットには貼らない**。
- 確かめ方: 本番のサイトを開き直して、地図に写真付きのお店（ホットペッパーの店）が出る。出なければ Edge Functions → `shops-hotpepper` → Logs に `hotpepper error response` が出ていないか見る（出ていればキーの写し間違い）。

### B. 町のデータ（Ubuntu のターミナルで、コマンド 3 つ。5〜10 分）
`towns` バケット（非公開）は作成済み。Ubuntu を開いて、1 行ずつ打つ:
```
cd ~/mogumo-go
npx supabase login
npx supabase storage cp -r .towns-out/g ss:///towns/g --experimental --remote=jaypeaejbzkeudwvvrnb --jobs 8
```
- 2 行目: ブラウザが開く（または URL が出る）→ Supabase にログイン → 画面の確認コードをターミナルに入れる。
- 3 行目: `Uploading: … => /towns/g/…` が 1,025 行流れて、最後に `"uploaded":[…]` が出れば完了（数分）。途中で止まったら、同じ 3 行目をもう一度打つ（上書きされるだけ）。
- 確かめ方: Supabase（本番）→ Storage → `towns` → `g` の中に **`index.json`** と `…json.gz` が並ぶ。そのあと本番のアプリで 1 軒チェックインして、記録の「町」に町の名前が出る。
- 終わったら（任意）`npx supabase logout`（作業用のログインを消す）。
- （画面でやる場合）Storage → `towns` を開き、エクスプローラーで `\\wsl$\Ubuntu\home\otosa\mogumo-go\.towns-out` の **`g` フォルダごと**ドラッグ。

### C. 完了処理（A と B のあと）
- このファイルの 1 行目を `状態: 完了` にして、`handoff/LOG.md` に「本番デプロイ完了」の 1 行を足す。
