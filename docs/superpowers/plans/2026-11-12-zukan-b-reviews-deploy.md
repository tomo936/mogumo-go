# 図鑑（案B）＋感想と写真：Supabase の準備（オーナー用）

関数の置き直しはありません。SQL 0007 は 2026-11-12 に dev（`mogumo-go-dev`）へ流し済みです（オーナー）。
本番（`main`）に出すときだけ、本番のプロジェクトで同じことをします。

## 1. 表とバケットがあるかを確かめる
1. 管理画面の右上のプロジェクト名を確かめる。
2. Table Editor に `reviews` と `review_reports` がある。
3. Storage に `review-photos`（非公開・300KB まで・jpeg と webp）がある。
   - 無ければ `supabase/migrations/0001_init.sql` が流れていない。リーダーに知らせる。

## 2. SQL 0007 を流す（本番のときだけ。dev は済み）
1. SQL Editor を開き、`supabase/migrations/0007_review_visibility.sql` を全部貼って Run。
   何度流しても同じ結果です。
2. 確かめ（1 行出れば OK: `is_public / boolean / true`）:
   ```sql
   select column_name, data_type, column_default from information_schema.columns
    where table_schema = 'public' and table_name = 'reviews' and column_name = 'is_public';
   ```

## 3. iPhone で確かめること（dev）
- 図鑑: 一覧が案B のカード（3 列×3 段）、丸い字、行ったお店に No.・星（感想が無ければ「感想まだ」）・回数。
- チェックインのあと: 紙ふぶきが終わると下に「✎ 感想を書く」が 10 秒出る。押して星・ひとこと・写真で保存できる。
- 図鑑の詳細: 「わたしの感想」に今書いた感想と写真。非公開にすると「🔒 自分だけ」。「書く・直す」で直す・消す。
- 別のアカウントで同じお店を見ると、公開の感想だけが「みんなの感想」とお店のシート（くわしく見る）に出る。非公開は出ない。
- 「⋯」→「通報する」で通報できる。通報は Table Editor の `review_reports` に入る。
  非表示にするときは `reviews` のその行の `hidden` を true にする。
- 写真が「この写真は使えませんでした」になったら、その写真の種類（HEIC など）を教えてください。
