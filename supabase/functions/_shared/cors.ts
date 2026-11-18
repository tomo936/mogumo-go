// 関数の CORS（2026-11-18 セキュリティ診断: 「* をやめて、本番と開発のドメインに絞る」）。
// 各関数の入口を withCors で包み、返事の Access-Control-Allow-Origin を、許したオリジンのときだけそのオリジンにする。
// Deno / npm の import は置かない（Vitest から読むため）。
const ALLOWED = new Set(['https://mogumo-go.vercel.app', 'https://mogumo-go-dev.vercel.app'])
const LOCAL = /^http:\/\/(localhost|127\.0\.0\.1)(:\d{1,5})?$/ // 手元の開発（vite）

export function allowedOrigin(origin: string | null): string | null {
  if (!origin) return null
  return ALLOWED.has(origin) || LOCAL.test(origin) ? origin : null
}

export function withCors(handler: (req: Request) => Response | Promise<Response>) {
  return async (req: Request): Promise<Response> => {
    const res = await handler(req)
    const headers = new Headers(res.headers)
    const origin = allowedOrigin(req.headers.get('Origin'))
    if (origin) headers.set('Access-Control-Allow-Origin', origin)
    else headers.delete('Access-Control-Allow-Origin')
    headers.append('Vary', 'Origin')
    return new Response(res.body, { status: res.status, statusText: res.statusText, headers })
  }
}
