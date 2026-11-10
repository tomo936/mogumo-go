# 週ミッションを dev の Supabase に置く手順（オーナー用）

順番どおりにやってください（1 → 2）。チェックインの関数は置き直しません。

## 1. SQL（0006）を流す
1. Supabase の管理画面 → SQL Editor を開く。
2. まず次を流して、0 が出るのを確かめる（0 でなくても壊れませんが、念のため）:
   `select count(*) from public.weekly_missions;`
3. `supabase/migrations/0006_weekly_missions.sql` の中身を全部貼って Run。
   「Success」が出れば完了（何度流しても同じ結果になります）。

## 2. 関数 `weekly-missions` を作る
1. 管理画面 → Edge Functions → 「Deploy a new function」→「Via Editor」。
2. 名前は `weekly-missions`。
3. ファイルを3つ作って、それぞれ中身を貼る（同じ名前で）:
   - `index.ts` ← `supabase/functions/weekly-missions/index.ts`
   - `core.ts` ← `supabase/functions/weekly-missions/core.ts`
   - `kind.ts` ← `supabase/functions/weekly-missions/kind.ts`
4. 「Verify JWT」はオン（ほかの関数と同じ）のまま Deploy。
   秘密の値（Secrets）は新しく足すものはありません。

## 確かめ方
- アプリで上の「？」を押す → 気配の下に「今週のミッション」のチケット3枚が出る。
- 出ずに「ミッションを読めませんでした」なら、1 か 2 がまだか、失敗しています（関数の Logs に `weekly-missions: failed` が出ます）。
- お店にチェックインして、条件に合えば進み（1/3 など）が増える。達成すると「ミッション達成！」の帯とコインが増える。
