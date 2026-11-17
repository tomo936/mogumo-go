// ログイン画面。起動画面（Splash）と同じ絵とロゴの上に、下からログインのカード。
// ログインすると利用規約・プライバシーポリシーに同意したことになる（/terms・/privacy はログイン前でも読める）
import { Link, Navigate } from 'react-router'
import { useRef, useState } from 'react'
import { useAuth } from '../auth/AuthContext.ts'
import { captchaToken } from '../auth/infra/turnstile.ts'
import titleArt from '../assets/ui/title.webp'
import logoArt from '../assets/ui/logo.webp'
import './login.css'

// Google のログインボタンの決まり（白地・G のマーク・「Google でログイン」）に合わせる
function GoogleMark() {
  return (
    <svg viewBox="0 0 48 48" width="20" height="20" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  )
}

export function LoginPage() {
  const { session, loading, signInWithGoogle, signInAsGuest } = useAuth()
  const [busy, setBusy] = useState<'google' | 'guest' | null>(null)
  const [guestFailed, setGuestFailed] = useState(false)
  const captchaRef = useRef<HTMLDivElement>(null)
  if (loading) return <p className="status">読み込み中…</p>
  if (session) return <Navigate to="/" replace />
  return (
    <main className="login" style={{ '--login-art': `url(${titleArt})` } as React.CSSProperties}>
      <img className="login__logo" src={logoArt} alt="もぐもGO" />
      <section className="login__card" aria-label="ログイン">
        <p className="login__lead">
          霧を晴らして、
          <br />
          まちのおいしいお店を見つけよう
        </p>
        <button
          type="button"
          className="login__google"
          disabled={busy !== null}
          onClick={() => {
            setBusy('google')
            void signInWithGoogle().catch(() => setBusy(null))
          }}
        >
          <GoogleMark />
          <span>{busy === 'google' ? 'Google に移動しています…' : 'Google でログイン'}</span>
        </button>
        <button
          type="button"
          className="login__guest"
          disabled={busy !== null}
          onClick={async () => {
            setBusy('guest')
            setGuestFailed(false)
            // 人間かの確認（たいていは見えないまま通る）→ ゲストで入る。入れたら session が変わって地図へ進む
            const ok = await captchaToken(captchaRef.current!)
              .then((t) => signInAsGuest(t))
              .catch(() => false)
            if (!ok) {
              setGuestFailed(true)
              setBusy(null)
            }
          }}
        >
          {busy === 'guest' ? '準備しています…' : 'ゲストではじめる'}
        </button>
        <div ref={captchaRef} className="login__captcha" />
        {guestFailed && (
          <p className="login__err" role="alert">
            はじめられませんでした。通信のよい所でもう一度お試しください。
          </p>
        )}
        <p className="login__guest-note">ゲストの記録はこの端末だけに残ります。あとから Google をつなげば引き継げます。</p>
        <p className="login__agree">
          ログインすると、<Link to="/terms">利用規約</Link>と<Link to="/privacy">プライバシーポリシー</Link>に同意したことになります。
        </p>
      </section>
    </main>
  )
}
