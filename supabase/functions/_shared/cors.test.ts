import { describe, expect, it } from 'vitest'
import { allowedOrigin, withCors } from './cors.ts'

describe('allowedOrigin', () => {
  it('本番・開発・手元だけ許す', () => {
    expect(allowedOrigin('https://mogumo-go.vercel.app')).toBe('https://mogumo-go.vercel.app')
    expect(allowedOrigin('https://mogumo-go-dev.vercel.app')).toBe('https://mogumo-go-dev.vercel.app')
    expect(allowedOrigin('http://localhost:5173')).toBe('http://localhost:5173')
    expect(allowedOrigin('http://127.0.0.1:5174')).toBe('http://127.0.0.1:5174')
  })
  it('ほかは許さない（似た名前・http の本番・空も）', () => {
    for (const o of ['https://evil.example', 'https://mogumo-go.vercel.app.evil.example', 'http://mogumo-go.vercel.app', 'https://localhost', 'http://localhost.evil.example', null, ''])
      expect(allowedOrigin(o)).toBeNull()
  })
})

describe('withCors', () => {
  const inner = () => new Response('ok', { status: 200, headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'text/plain' } })
  it('許したオリジンには、そのオリジンを返す（* は消える）', async () => {
    const res = await withCors(inner)(new Request('https://x/f', { headers: { Origin: 'https://mogumo-go.vercel.app' } }))
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://mogumo-go.vercel.app')
    expect(res.headers.get('Content-Type')).toBe('text/plain')
    expect(await res.text()).toBe('ok')
  })
  it('許さないオリジンには、許可の見出しを付けない', async () => {
    const res = await withCors(inner)(new Request('https://x/f', { headers: { Origin: 'https://evil.example' } }))
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull()
  })
})
