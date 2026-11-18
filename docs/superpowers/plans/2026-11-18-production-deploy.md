# 本番に出す手順（2026-11-18 作成）

- 本番のサイト: `https://mogumo-go.vercel.app`（ブランチ `main`）
- 本番の Supabase: プロジェクト **`mogumo-go`**（dev は `mogumo-go-dev`。**作業のたびに画面の上のプロジェクト名を確かめる**。前に関数を取り違えて置いたことがある）
- 目標（オーナー 2026-11-18）: **本番でも dev と同じ数のお店が出る**（地図データのお店 `osm:` ＋ホットペッパーのお店 `hp:`）。気配・ミッション・町・ゲストも dev と同じに動く。
- 結合試験（`docs/integration-test-2026-11-18.md`）は、この手順で入れるものを手元で全部通してある。

担当: **[CC]** = Claude Code、**[オーナー]** = 管理画面の操作（キーやアカウントが要るもの）。

---

## 0. 出す前に決めること [オーナー]

1. リリース前に直すもの（直す作業は [CC]）
   - 結合試験で見つけた 3 件: ビルの一覧の「済み」が古いまま（中）・ポコタンの案内のガチャの文（小）・ゲストのお問い合わせ送信後の文（小）
   - 総合レビュー（`docs/release-review-2026-11-17.md`）の高・中: おすすめは **H1 ガチャをサーバーでも閉じる（SQL 1 本）**・エラー画面・ログインの読み込み中のまま止まる件
2. プライバシーポリシー・利用規約の本文を読む（`/privacy`・`/terms`。専門家の確認はなし）。

## 1. コードの準備 [CC]

1. **ホットペッパーの店と気配が dev のサイトでしか動かない制限を外す**（総合レビュー H3）。
   - いま: `src/shops/infra/hotpepper.ts` の `shopSourceEnabled` が「開発中か `mogumo-go-dev.vercel.app` のときだけ」。本番ではホットペッパーの店・気配・図鑑用の地図のお店の送信（`shops-osm`）が止まり、**地図データのお店だけになる**。
   - 理由: 11/6 に地図の別サービス（Overpass）からホットペッパーへ替えたときに残った古い制限。本番で止めておく理由はない。
   - 直し方: 本番でも動くようにする（`?fake` の歩いたふりは dev だけのまま）。テストも直す。
2. 0 で決めたものを直す → `npm test`・`npx tsc -b`・`npm run lint` → 結合試験を手元で回し直す（`scripts/e2e/`）。
3. `cycle1-building` → `dev` に入れて、オーナーが iPhone の dev で軽く確かめる。

## 2. 本番の Supabase（`mogumo-go`）

### 2-1. いま何が入っているかを確かめる [オーナー]（1 分）
記録では、本番にどこまで SQL が入っているかが分からない（0001 だけの可能性が高い）。SQL Editor → New query に下を貼って Run。結果をそのまま Claude Code に貼る。

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
（手元の Supabase で全部 `true` になることを確かめ済み）

### 2-2. 足りない SQL を番号の順に流す [オーナー]
- `false` の番号の `supabase/migrations/00xx_*.sql` を、**小さい番号から順に** 1 本ずつ全部貼って Run。
- **0008 はいつも流す**（何度流しても同じ結果。上の確かめ方では見分けられないため）。
- 0 で H1 を直すと決めたら、その SQL も最後に流す。
- 0013 は、2-3 の匿名ログインをオンにしたあとに流すのが安全（dev と同じ順）。
- 赤いエラーが出たら、そこで止めて文を Claude Code に貼る。

### 2-3. ログインの設定 [オーナー]（Authentication）
1. **Sign In / Providers**: 「Allow anonymous sign-ins」をオン、「Allow manual linking」をオン。Google はオンのまま。
2. **Attack Protection**: 「Enable Captcha protection」をオン → Turnstile by Cloudflare → **秘密キー**（dev と同じウィジェットのものでよい。3 を参照）。
3. **URL Configuration**: Site URL が `https://mogumo-go.vercel.app`、Redirect URLs に `https://mogumo-go.vercel.app/**` があるか確かめる（11/5 に入れた記録あり）。

### 2-4. 町の境目のファイル [オーナー]（10〜20 分）
- 手順は `docs/superpowers/plans/2026-11-10-towns-deploy.md` の「3. 境目のファイルを置く」と同じ（Storage → New bucket → `towns`、**Public はオフ**、`.towns-out/g` をフォルダごとドラッグ。1,025 ファイル・59MB）。
- `.towns-out/` はパソコンの中にある（リポジトリには無い。11/10 に作ったものが残っている）。
- Storage に `review-photos`（非公開）もあるか見る（0001 で作られる）。

### 2-5. ホットペッパーのキー [オーナー]
- Edge Functions → **Secrets** に `HOTPEPPER_API_KEY`（dev と同じキーでよい）。**キーは Claude Code に渡さない・チャットに貼らない**。

### 2-6. 関数 7 本を置く
dev では 1 本ずつ画面に貼ったが、本番は 7 本・ファイルも多い（`daily-hints` はチェーン店の一覧が大きい、`towns` は 3 ファイル）ので、**コマンドでまとめて置くのがおすすめ**。

- おすすめ [オーナー 1 回 → CC]:
  1. オーナーがこの会話で `! npx supabase login` を打ち、開いたブラウザで Supabase にログインする（キーはパソコンの中に保存され、Claude Code は読まない）。
  2. オーナーが本番の **Project ref**（Project Settings → General の `Reference ID`。秘密ではない）を Claude Code に伝える。
  3. Claude Code が `npx supabase functions deploy --project-ref <本番の ref>` で 7 本を置き、置けた一覧を見せる。
- 画面で置く場合 [オーナー]: 各関数の手順書のとおり。名前を先に変える・Verify JWT はオン。

| 関数 | 中のファイル | Secrets |
|---|---|---|
| `checkin` | `index.ts` ほか（フォルダの中全部） | なし |
| `shops-hotpepper` | `index.ts`・`core.ts` | `HOTPEPPER_API_KEY` |
| `shops-osm` | フォルダの中全部 | なし |
| `daily-hints` | フォルダの中全部（チェーン店の一覧を含む） | なし |
| `weekly-missions` | フォルダの中全部（`kind.ts` を含む） | なし |
| `towns` | `index.ts`・`core.ts`・`tiles.ts` | なし |
| `delete-account` | `index.ts` | なし |

### 2-7. 運営の表を確かめる [オーナー]
- Table Editor → `app_status`: 1 行あり、メンテナンスが**オフ**になっていること（0010 で作られる）。

## 3. Cloudflare Turnstile [オーナー]
- ウィジェットの Domains に `mogumo-go.vercel.app` を足す（いまは `mogumo-go-dev.vercel.app` と `localhost`）。足さないと、本番で「ゲストではじめる」が失敗する。

## 4. Google [オーナー]
- Google Cloud（プロジェクト `mogumo-go`、クライアント `mogumo-go-web`）の JavaScript 生成元に `https://mogumo-go.vercel.app` があるか確かめる（11/5 に入れた記録あり）。

## 5. Vercel [オーナー → CC]
1. [オーナー] Settings → Environment Variables で、**Production** に次の 3 つがあるか確かめる:
   - `VITE_SUPABASE_URL`・`VITE_SUPABASE_ANON_KEY` … **本番（`mogumo-go`）のもの**（dev のものになっていないか）
   - `VITE_TURNSTILE_SITE_KEY` … サイトキー（新しく足す。公開してよいキー）
2. [CC] `dev` → `main` に入れる（オーナーの OK のあと）。Vercel が本番に出す。

## 6. 確かめる [オーナー、iPhone で 5〜10 分]
1. 本番を開く → タイトル → **ゲストではじめる**（ロボット確認が通る）→ 初回設定 → 地図。
2. ポコタンの案内が最後まで出る → ログインボーナス。
3. 地図に **dev と同じくらいのお店のピン**（ホットペッパーの写真付きの店も）。経堂などで dev と見比べてもよい。
4. 「？」で気配が 3 つ、下に週ミッション。
5. 近くのお店で 1 軒チェックイン → 紙ふぶき・コイン。
6. Google でもログインできる（別の日でもよい）。
7. 設定 → 退会で、試したゲストを消す。

うまくいかなければ、画面のスクショと時刻を Claude Code に。関数の Logs（Edge Functions → 関数 → Logs）に `failed` が出ていれば、その行も。

## 7. 困ったとき
- すぐ止めたい: Table Editor → `app_status` でメンテナンスをオン（アプリがメンテの画面になる）。
- 前の版に戻したい: Vercel → Deployments → 前のものの「…」→ **Instant Rollback**。
