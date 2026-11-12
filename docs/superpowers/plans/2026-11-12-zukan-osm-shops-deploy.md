# 図鑑に地図のお店を出す：関数 `shops-osm` を置く手順（オーナー用）

SQL はありません。関数を 1 つ新しく置くだけです。秘密の値（Secrets）も足しません。

## 関数を新しく作る
1. 管理画面の右上のプロジェクト名が `mogumo-go-dev` であることを確かめる。
2. Edge Functions → 「Deploy a new function」→「Via Editor」。
3. 関数の名前を **`shops-osm`** にする（ハイフン入り・小文字）。
4. エディターに、次の 3 つのファイルを同じ名前で作り、リポジトリの中身を丸ごと貼る。
   - `index.ts` ← `supabase/functions/shops-osm/index.ts`（最初からあるファイルの中身を置き換える）
   - `core.ts` ← `supabase/functions/shops-osm/core.ts`
   - `osmTile.ts` ← `supabase/functions/shops-osm/osmTile.ts`
5. 「Verify JWT」はオンのままで Deploy。

## 確かめ方
- 地図を開いて 1 分ほど待ち、図鑑を開く。晴れた場所の地図のお店（たこ焼き屋など）が「？？？」で出れば OK。
  - 関数を置く前でも、今の地図に読み込んでいるお店は図鑑に出ます（地図から直接渡すため）。置いたあとは、遠くのお店も残ります。
- 関数の Logs に `shops-osm failed` が続けて出ていなければ大丈夫です。
- Table Editor の `shops` に `osm:` で始まる行が増えていきます（地図の公開データだけで、あなたの位置は入りません）。
