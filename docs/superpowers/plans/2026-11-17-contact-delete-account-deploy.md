# お問い合わせ・退会：置く手順（オーナー用）

SQL を 1 つ流して、関数を 1 つ新しく置きます。秘密の値（Secrets）は足しません（関数は最初からある `SUPABASE_SERVICE_ROLE_KEY` を使います）。

## 1. SQL（お問い合わせ）
1. 管理画面の右上のプロジェクト名が `mogumo-go-dev` であることを確かめる。
2. SQL Editor に `supabase/migrations/0012_contact.sql` を全部貼って Run。

## 2. 関数 `delete-account`（退会）
1. Edge Functions → 「Deploy a new function」→「Via Editor」。
2. 関数の名前を **`delete-account`** にする。
3. `index.ts` に `supabase/functions/delete-account/index.ts` の中身を丸ごと貼る。
4. 「Verify JWT」はオンのままで Deploy。

## 確かめ方
- お問い合わせ: 設定 → お問い合わせ・不具合の報告 → 送る。Table Editor の `inquiries` に 1 行増え、`reply_to` に自分のメールが入っていれば OK。
- 退会: **本当に消えるので、ふだんのアカウントでは試さない。** テスト用の Google アカウントでログインして、少し遊んで（チェックイン・感想と写真）から、設定 → データを消してやめる → すべて消す。
  - ログイン画面に戻る。
  - Authentication → Users からそのアカウントが消えている。
  - Storage の `review-photos` にそのアカウントの UID のフォルダが無い。
  - 同じアカウントでもう一度ログインすると、ニックネームの設定から始まる。
- 関数の Logs に `delete-account failed` が出たら、その行を教えてください。
