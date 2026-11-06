# ホットペッパー連携＋チェックイン 公開（デプロイ）の手順（本人用）

コードは `cycle1-checkin` ブランチに入っています。アプリを実際に動かすには、Supabase の **開発用プロジェクトに、データベースの変更（SQL）と関数（Edge Function）を置く** 必要があります。下の順に進めてください。

> **重要: 必ず開発用プロジェクト `mogumo-go-dev` で作業してください。本番のプロジェクトは使いません。**
> 前に、関数を本番に置いてしまったことがあります。画面の左上（または上のほう）に出るプロジェクト名が `mogumo-go-dev` になっていることを、毎回確かめてください。

## 手順

### 1. 開発用プロジェクトを開く
1. ブラウザで Supabase（supabase.com）にログインする。
2. プロジェクト一覧から **`mogumo-go-dev`** を選ぶ。

### 2. 前の段のテーブルがあるか確かめる（0001）
1. 左のメニューから **Table Editor** を開く。
2. 次の5つのテーブルがあることを確かめる: `profiles`、`shops`、`checkins`、`fog_cells`、`coin_ledger`。
3. 1つでも無いときは、ここで止めて Claude Code に伝える（0001 を先に流す必要があります）。

### 3. 新しい SQL（0002）を流す
1. 左のメニューから **SQL Editor** を開く。
2. **New query**（新しいクエリ）を押す。
3. パソコンで `supabase/migrations/0002_checkin.sql` を開き、**中身を全部コピー**して、SQL Editor に貼る。
4. 右下の **Run** を押す。
5. 「Success（成功）」と出れば OK。赤いエラーが出たら、文面をそのまま Claude Code に見せる。

### 4. 関数 `shops-hotpepper` を置く
1. 左のメニューから **Edge Functions** を開く。
2. **Deploy a new function** → **Via Editor** を選ぶ。
3. **先に、関数の名前を `shops-hotpepper` に変える**（名前を変えないと、仮の名前で置かれてしまいます。前にもありました）。
4. エディターには `index.ts` が出ている。パソコンの `supabase/functions/shops-hotpepper/index.ts` の中身を全部コピーして、貼り替える。
5. ファイルを足す（Add file などのボタン）。名前は **`core.ts`**。`supabase/functions/shops-hotpepper/core.ts` の中身を全部貼る。
6. 設定の **Verify JWT** が **オン**になっていることを確かめる。
7. **Deploy function** を押す。

### 5. 関数 `checkin` を置く
手順4と同じやり方で、次のようにする。
1. **Deploy a new function** → **Via Editor**。
2. 関数の名前を **`checkin`** に変える（先に）。
3. `index.ts` に `supabase/functions/checkin/index.ts` の中身を貼る。
4. `core.ts` を足して、`supabase/functions/checkin/core.ts` の中身を貼る。
5. **Verify JWT** がオンのまま **Deploy function**。

### 6. ホットペッパーのキーがあるか確かめる
1. **Edge Functions** の中の **Secrets**（またはメニューの Edge Functions → Secrets）を開く。
2. **`HOTPEPPER_API_KEY`** が一覧にあることを確かめる（値は見えなくて大丈夫。見せないでください）。
3. 無いときは、ホットペッパーのキーを新しく登録する（Claude Code に聞いてください）。

### 7. 古い関数 `shops-overpass` を消す
1. **Edge Functions** の一覧で `shops-overpass` を探す。
2. 右側のメニュー（…）から **Delete** を選び、消す。（もう使いません）

### 8. iPhone で確かめる
1. iPhone で、開発用のアプリを開く（いつもの URL）。ログインして、自宅を設定済みの状態にする。
2. 次を順に見て、結果を Claude Code に伝える。
   - [ ] 地図のお店と、ホットペッパーのお店が出る。
   - [ ] 霧の中のお店が、50m 以内なら出る。まわりの雲がうすくなっている。
   - [ ] お店の建物をタップして、シートが出て、チェックインできる。紙ふぶき → 緑の帯 → チェックの印 → 霧の波、の順に動く。
   - [ ] アプリを開き直しても、晴れた範囲とチェックの印が残っている。
   - [ ] 同じお店でその日にもう一度チェックインすると、「今日のコインは受け取り済み」と出る。
   - [ ] 霧の波が動いている間、重くないか（カクカクしないか）。
3. うまくいかないとき: 画面に出た文面（または写真）をそのまま Claude Code に見せてください。

### 9. Claude Code がやること（本人は不要）
- ホットペッパーのジャンルコードを、関数が返した実データで確かめる。
- 自宅のまわりで「ホットペッパーのお店」と「地図のお店」の数を数えて報告する。
