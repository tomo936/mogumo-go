# ログイン方法を増やす（A3）調査メモ

2026-11-17。まだ何も決めていない（オーナーが選ぶ）。条件: 完全無料・iPhone の Safari（Web アプリ）優先。今は Google だけ（`src/auth/AuthProvider.tsx` の `signInWithOAuth({ provider: 'google' })`）。

## 候補と結論
| 方法 | 無料か | 手間 | 結論 |
|---|---|---|---|
| **ゲスト（匿名で始める）** | 無料（Supabase の全プランに含まれる） | 中 | ◎ おすすめ。あとから Google などをつなげば記録を引き継げる |
| **LINE** | LINE ログインは無料。Supabase の「独自の OAuth/OIDC プロバイダー」は無料プランで 3 つまで | 中〜大（試しながら） | ○ 日本の利用者に一番なじみ。ただし動くかは試さないと分からない点がある |
| メール（ワンタイムのリンク・コード） | Supabase 標準の送信は**プロジェクト全体で 1 時間 2 通**しか送れず、実際に使うには外の送信サービス（SMTP）が要る。送信サービスは**自分のドメイン**が要ることが多い（年 1,000〜2,000 円ほど） | 中 | △ ドメインを買うなら可。完全無料には収まりにくい |
| X（旧 Twitter） | 2026-02 に X の API の無料枠が新規の開発者向けに終わり、使った分だけ払う形が標準になった（ログインでも利用者の情報を読む呼び出しが要る）。メールは利用者が X で確認済みのときだけもらえ、無いとログインに失敗する報告がある | 小〜中 | × 完全無料に収まらない恐れ |
| Discord・GitHub | 無料（Supabase 標準） | 小 | △ 作るのは簡単だが、グルメアプリの利用者層には合いにくい |
| Apple | Apple Developer（年 $99）が必須。さらに Web だけで使うには App Store のアプリが要る | — | × 完全無料に反する |
| パスキー（顔・指紋） | Supabase に入ったばかり（実験的）。**パスキーだけで新規登録はできない**（既存のアカウントに後から足すもの） | 中 | × 今は見送り。将来「次から顔でログイン」の追加として |
| 電話番号（SMS） | SMS は有料 | — | × |

## ゲスト（匿名で始める）の要点
- Supabase の Anonymous Sign-ins。管理画面でオンにするだけで使える。無料プランに含まれる（月 5 万人まで）。
- あとで Google などを「つなぐ」と、同じアカウント（同じ user_id）のまま本登録になる（`linkIdentity()`。管理画面で manual linking をオンにする）。自宅の保存（`mogumo.home.<userId>`）もそのまま使える。
- 気をつけること:
  - つながないままブラウザのデータを消す・機種を変えると、記録が戻らない → 画面で「記録を守るために Google などをつなごう」と勧める。
  - いたずらで大量に作られうる → Supabase は匿名ログインに CAPTCHA（Cloudflare Turnstile は無料）を勧めている。
  - 感想の投稿・通報・お問い合わせはゲストに許すか決める（RLS で `is_anonymous` を見て止められる）。
  - 退会・お問い合わせの返事（メールが無い）・プライバシーポリシーの書き直しが要る。

## LINE の要点
- LINE ログイン v2.1 は OpenID Connect に対応（発行元 `https://access.line.me`）。
- Supabase 側は「Authentication > Providers > New Provider」で独自プロバイダーとして足す（無料プランは 3 つまで）。
- 気になる点（試して確かめる）:
  - LINE の Web ログインの ID トークンは HS256（チャネルの秘密鍵で署名）で、Supabase の OIDC の自動設定は公開鍵（JWKS）で確かめる作り → 合わない恐れ。その場合は「手動設定（OAuth2）」で LINE のプロフィール API から読む形にする。
  - メールアドレスをもらうには LINE Developers で申請が要る（画面の説明のスクリーンショットを出す）。もらわない設定（`email_optional`）もできるが、その場合は Google と同じ人でも別のアカウントになる。
- オーナーの作業: LINE Developers でプロバイダーと LINE ログインのチャネルを作る（無料）。

## 同じ人が 2 つの方法で入ったら
- Supabase は、確かめ済みの同じメールアドレスなら自動で 1 つのアカウントにまとめる。メールが無い方法（LINE でメールをもらわない・ゲスト）は別のアカウントになる → 設定から「つなぐ」ボタンで自分でまとめる形にする。

## 出典
- Supabase 匿名ログイン https://supabase.com/docs/guides/auth/auth-anonymous ・ アカウントをつなぐ https://supabase.com/docs/guides/auth/identity-linking
- Supabase 独自の OAuth/OIDC プロバイダー https://supabase.com/docs/guides/auth/custom-oauth-providers ・ https://supabase.com/blog/custom-oauth-oidc-providers
- Supabase パスキー https://supabase.com/docs/guides/auth/passkeys
- Supabase 料金 https://supabase.com/pricing ・ メール送信 https://supabase.com/docs/guides/auth/auth-smtp
- LINE ログイン https://developers.line.biz/en/docs/line-login/integrate-line-login/ ・ https://developers.line.biz/en/docs/line-login/verify-id-token/
- X / Twitter（Supabase）https://supabase.com/docs/guides/auth/social-login/auth-twitter ・ https://supabase.com/blog/x-twitter-oauth-2-provider
- X API の料金の変更（第三者の記事）https://roboin.io/article/en/2026/02/08/x-transitions-api-to-pay-per-use-model-ending-free-plan/ ・ https://gigazine.net/gsc_news/en/20260209-x-api-pay-per-use
- Apple https://developer.apple.com/documentation/signinwithapple/configuring-your-environment-for-sign-in-with-apple
