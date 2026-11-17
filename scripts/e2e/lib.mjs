import { chromium } from '/home/otosa/tools/pw/node_modules/playwright/index.mjs'
export const BASE = 'http://127.0.0.1:5174'
export const OUT = process.env.E2E_OUT ?? '/home/otosa/mogumo-go/art/qa/e2e/'
export async function open({ fresh = false, geo = { latitude: 35.6512, longitude: 139.6362 } } = {}) {
  const dir = process.env.E2E_PROFILE ?? '/tmp/mogumo-e2e-profile'
  if (fresh) { const fs = await import('node:fs'); fs.rmSync(dir, { recursive: true, force: true }) }
  const ctx = await chromium.launchPersistentContext(dir, {
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'ja-JP',
    geolocation: geo, permissions: ['geolocation'],
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  })
  const fx = (await import('node:fs')).readFileSync(new URL('./hp-fixture.json', import.meta.url), 'utf8')
  await ctx.route('**/functions/v1/shops-hotpepper', (r) => r.request().method() === 'OPTIONS' ? r.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' } }) : r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: fx }))
  const p = ctx.pages()[0] ?? await ctx.newPage()
  const log = []
  p.on('console', (m) => m.type() === 'error' && log.push('console: ' + m.text().slice(0, 220)))
  p.on('pageerror', (e) => log.push('pageerror: ' + String(e).slice(0, 220)))
  p.on('response', async (r) => { const u = r.url(); if (r.status() >= 400 && /54321|5174/.test(u)) { let t = ''; try { t = (await r.text()).slice(0, 160) } catch {} ; log.push(`http ${r.status()} ${u.replace(/\?.*/, '').replace('http://127.0.0.1:54321', '')} ${t}`) } })
  return { ctx, p, log }
}
export const text = async (p) => (await p.locator('body').innerText()).replace(/\s*\n+\s*/g, ' / ').slice(0, 400)
export async function shot(p, name) { await p.screenshot({ path: OUT + name + '.png' }) }
export async function go(p, path, wait = 4000) {
  await p.goto(BASE + path, { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(wait)
  const sp = p.locator('button.splash'); if (await sp.count()) { await sp.click(); await p.waitForTimeout(1500) }
}
export async function settle(p, maxMs = 90000) {
  const t0 = Date.now()
  while (Date.now() - t0 < maxMs) {
    const z = Number((await p.locator('body').innerText()).match(/zoom ([\d.]+)/)?.[1] ?? 0)
    if (z >= 16.8) { await p.waitForTimeout(4000); return Math.round((Date.now() - t0) / 1000) }
    await p.waitForTimeout(1000)
  }
  return -1
}
