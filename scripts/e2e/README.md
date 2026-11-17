# 結合試験の台本（手元の Supabase ＋自動のブラウザ）

2026-11-18 に作った。結果は `docs/integration-test-2026-11-18.md`。

## 前提
- Docker が動いている（サンドボックスの外でだけ使える）。
- 手元の Supabase: `npx supabase start -x studio,imgproxy,vector,logflare,mailpit,realtime,supavisor,postgres-meta`
  - 初回は `supabase/config.toml` の `[db.migrations] enabled` を一時的に false にして起動し、そのあと true に戻して `npx supabase migration up`（起動時に流すと 0001 が `storage.buckets` より先に走って止まる）。
- 見本のホットペッパーの店: `docker exec -i supabase_db_mogumo-go psql -U postgres < scripts/e2e/seed.sql`（ブラウザ側は `lib.mjs` が `shops-hotpepper` を `hp-fixture.json` で返す）。
- 町の境目: `.towns-out/g/` を手元の `towns` バケット（非公開）の `g/` に入れる（試験の記録にある curl の手順）。
- アプリ: `.env` 系のファイルは作らず、環境変数で手元の Supabase を指す。
  `VITE_SUPABASE_URL=http://127.0.0.1:54321 VITE_SUPABASE_ANON_KEY=<supabase status の ANON_KEY> VITE_TURNSTILE_SITE_KEY= npx vite --host 127.0.0.1 --port 5174`
- Playwright は `/home/otosa/tools/pw/`、ブラウザは `PLAYWRIGHT_BROWSERS_PATH=/home/otosa/tools/browsers`。

## 回し方（順番に）
`s12.mjs` の前半（新しいゲストで手順 1〜2）→ `s3`（初回設定）→ `s4`（ポコタン・ログインボーナス）→ `s5`/`s5c`（お店・コルティ）→ `s6`/`s6b`（チェックイン）→ `s7`（図鑑・記録・ワールドマップ）→ `s8`/`s8b`（気配・ミッション・お知らせ・プレゼント・町）→ `s10`（キャラ一覧）→ `s11`（設定）→ `s12`（お問い合わせ・退会）→ `s13`/`rls`（手順外: 感想・マイページ・図鑑の？・記録の町・ログアウト）。

- 自動のブラウザは GPU が無く遅い。地図が寄り終わるまで 20〜35 秒かかるので、`settle()` で倍率 16.8 以上になるまで待つ。
- 撮った画面は `E2E_OUT`（既定 `art/qa/e2e/`、リポジトリには入れない）。
