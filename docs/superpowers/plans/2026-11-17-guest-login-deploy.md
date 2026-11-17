# ゲストで始める：置く手順（オーナー用）

全部無料です。上から順にやってください。どこかで分からなくなったら、その画面の写真を送ってください。

## 1. Supabase（mogumo-go-dev）でゲストをオンにする
1. 右上のプロジェクト名が `mogumo-go-dev` であることを確かめる。
2. Authentication → Sign In / Providers（または Authentication → Settings）を開く。
3. **「Allow anonymous sign-ins」をオン** にして保存。
4. 同じ画面の **「Allow manual linking」をオン** にして保存（ゲストに Google をつなぐのに要る）。

## 2. SQL（感想・通報をゲストに許さない）
- SQL Editor に `supabase/migrations/0013_guest.sql` を全部貼って Run。

## 3. Cloudflare Turnstile（人間かの確認）のキーをもらう
1. https://dash.cloudflare.com/sign-up で無料登録（もうあればログイン）。
2. 左のメニューの **Turnstile** →「Add widget」（ウィジェットを追加）。
3. 名前: `mogumo-go`。
4. Hostname（ドメイン）に次の 2 つを足す:
   - dev のサイトのドメイン（例: `mogumo-go-git-dev-xxxx.vercel.app` のような、iPhone で開いているアドレスの `https://` と `/` の間）
   - `localhost`
5. Widget Mode は **Managed**（おまかせ）のまま →「Create」。
6. **Site Key（サイトキー）** と **Secret Key（秘密キー）** が出る。2 つとも控える。

## 4. Supabase に秘密キーを入れる
1. Supabase → Authentication → Attack Protection（または Security）→ **Enable Captcha protection をオン**。
2. Provider で **Turnstile by Cloudflare** を選ぶ。
3. **Secret Key** を貼って保存。
   - 注意: これをオンにすると、5 のサイトキーを入れるまでゲストで始められない（Google のログインは影響なし）。

## 5. Vercel にサイトキーを入れる
1. Vercel → プロジェクト → Settings → Environment Variables。
2. Key: `VITE_TURNSTILE_SITE_KEY`、Value: **Site Key**（公開してよいほう）。Environments は Preview と Development（本番を出すときに Production も）。
3. 保存したら、Deployments から dev の最新を **Redeploy**（入れた値は作り直したときに入る）。
4. 手元の `.env` にも `VITE_TURNSTILE_SITE_KEY=サイトキー` の 1 行を足す（手元で動かすとき用）。

## 確かめ方（iPhone で dev を開く）
1. ログアウトしてログイン画面へ →「ゲストではじめる」→ ニックネームの設定に進めば OK。
2. 地図でチェックイン → 演出のあとにポコタンが「記録を守ろう！」と出る（1 軒目）。
3. お店のシートの「✎ 感想」→「感想は Google をつないでから」が出る。
4. 設定 → アカウントに「ゲストで遊んでいます」→「Google をつないで記録を守る」→ Google を選ぶ → 戻ってきたら、設定にメールが出て、チェックインの記録がそのまま残っていれば OK。
   - **ふだん使いの Google（もう記録がある）でつなぐと**、「この Google には別の記録があるよ」が出る。それも正しい動き（「ゲストのまま続ける」を押せば何も消えない）。
5. Supabase → Authentication → Users に、ゲストは「Anonymous」と出る。
