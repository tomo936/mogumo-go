// 人間かの確認（Cloudflare Turnstile、無料）。ゲストで始めるときだけ使う（A3、いたずらで大量に作られないように）。
// サイトキーは公開してよいキーで、Vercel・.env の VITE_TURNSTILE_SITE_KEY に置く。秘密キーは Supabase の画面（Attack Protection）だけ。
// キーが無いあいだ（置く前の dev・テスト）は確認せずに null を返す（Supabase 側も CAPTCHA がオフなら通る）。
// 設計: docs/superpowers/specs/2026-11-17-guest-login-design.md
type Turnstile = {
  render(el: HTMLElement, opts: Record<string, unknown>): string
  remove(id: string): void
}
declare global {
  interface Window {
    turnstile?: Turnstile
  }
}

const SCRIPT = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
const TIMEOUT_MS = 30_000

let loading: Promise<Turnstile> | null = null
function load(): Promise<Turnstile> {
  if (window.turnstile) return Promise.resolve(window.turnstile)
  loading ??= new Promise<Turnstile>((resolve, reject) => {
    const s = document.createElement('script')
    s.src = SCRIPT
    s.async = true
    s.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error('turnstile')))
    s.onerror = () => {
      loading = null
      reject(new Error('turnstile'))
    }
    document.head.appendChild(s)
  })
  return loading
}

export const captchaEnabled = (): boolean => Boolean(import.meta.env.VITE_TURNSTILE_SITE_KEY)

// container の中に確認を出し（たいていは見えないまま自動で通る）、通ったらトークンを返す。キーが無ければ null。
export async function captchaToken(container: HTMLElement): Promise<string | null> {
  const sitekey = import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined
  if (!sitekey) return null
  const ts = await load()
  return new Promise<string>((resolve, reject) => {
    let id = ''
    const done = (f: () => void) => {
      clearTimeout(timer)
      f()
      try {
        ts.remove(id)
      } catch {
        // もう消えていてもよい
      }
    }
    const timer = setTimeout(() => done(() => reject(new Error('timeout'))), TIMEOUT_MS)
    id = ts.render(container, {
      sitekey,
      appearance: 'interaction-only', // 確かめが要るときだけ枠が出る
      language: 'ja',
      callback: (token: string) => done(() => resolve(token)),
      'error-callback': () => done(() => reject(new Error('turnstile'))),
    })
  })
}
