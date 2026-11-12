# 気配からチェーン店を外す：関数 `daily-hints` を置き直す手順（オーナー用）

SQL はありません。関数を1つ置き直すだけです。

## 関数 `daily-hints` を置き直す
1. 管理画面の右上のプロジェクト名が `mogumo-go-dev` であることを確かめる。
2. Edge Functions → `daily-hints` → Code（エディター）を開く。
3. 次の6つのファイルを、同じ名前で、リポジトリの中身に丸ごと置き換える。
   - 新しく作る3つ（エディターでファイルを足して名前を付ける）
     - `chain.ts` ← `supabase/functions/daily-hints/chain.ts`
     - `chainNames.ts` ← `supabase/functions/daily-hints/chainNames.ts`
     - `chainNamesExtra.ts` ← `supabase/functions/daily-hints/chainNamesExtra.ts`
   - 中身を置き換える2つ
     - `index.ts` ← `supabase/functions/daily-hints/index.ts`
     - `core.ts` ← `supabase/functions/daily-hints/core.ts`
   - 変わっていないので触らない1つ
     - `osmTile.ts`
4. 「Verify JWT」はオンのままで Deploy する。秘密の値（Secrets）は足しません。

## 確かめ方
- 気配は1日1回だけ作られます。今日の気配がもう出ているなら、明日の朝の新しい気配から効きます。
- 関数の Logs に `failed` が出ていなければ大丈夫です。
- もしチェーン店が気配に出てきたら、店名をリーダーに伝えてください。手で足す一覧（`chainNamesExtra.ts`）に足します。
- 関数を置き直す前でも、アプリ（dev）の側で候補からチェーンを外しているので、ほとんどの場合は出ません。
