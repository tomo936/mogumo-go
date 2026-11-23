// チェックインを 3 回して記録の画面を撮る（前後の比較用。OUT_NAME。2026-11-24）
import { open, go, shot } from './lib.mjs'
const P = process.env.OUT_NAME ?? 'x'
const { p } = await open({ fresh: true })
const W = (ms) => p.waitForTimeout(ms)
const { BASE } = await import('./lib.mjs')
await p.goto(BASE + '/', { waitUntil: 'domcontentloaded' }); await W(4000)
await p.locator('button.splash').click(); await W(2500)
await p.getByRole('button', { name: 'ゲストではじめる' }).click(); await W(6000)
if (!p.url().includes('/setup/name')) { await p.goto(BASE + '/setup/name'); await W(3000) }
await p.locator('#nickname').fill('しけんくん'); await p.getByRole('button', { name: '次へ' }).click(); await W(2500)
await p.locator('.cs__card').nth(1).click(); await W(500); await p.getByRole('button', { name: '次へ' }).click(); await W(6000)
await p.locator('.hs__ok').click(); await W(8000)
await p.evaluate(() => { for (const k of Object.keys(localStorage)) if (k.startsWith('mogumo.guide')) localStorage.setItem(k, '1') })
await go(p, '/?fake=35.6512,139.6362&day', 40000)
const box = p.locator('[aria-label="ポコタンの案内"]')
for (let i = 0; i < 30 && await box.count(); i++) { await box.click({ position: { x: 300, y: 50 } }).catch(() => {}); await W(600) }
const dismiss = async () => { for (let i = 0; i < 3; i++) { const b = p.getByRole('button', { name: 'とじる', exact: true }).first(); if (!(await b.isVisible().catch(() => false))) break; await b.click().catch(() => {}); await W(1500) } }
await W(4000); await dismiss()
let done = 0
try {
  // 画面の外にあることがあるので、要素に直接 click を送る（2026-11-24 「outside of the viewport」で止まった）
  await p.locator('.bldg-pins--facility', { hasText: 'コルティ' }).first().locator('.bldg-pin').first().evaluate((el) => el.click()); await W(2500)
  const sheet = p.locator('[aria-label="ビルのお店"]'); const n = await sheet.locator('li').count(); console.log('items', n)
  for (let i = 0; i < n && done < 3; i++) {
    await sheet.locator('li').nth(i).click(); await W(2000)
    const b = p.getByRole('button', { name: /^チェックイン$/ }).first()
    if (await b.count() && await b.isEnabled()) { await b.click(); await W(9000); done++; console.log('checked in', done); await dismiss() }
    await p.getByRole('button', { name: /経堂コルティ/ }).first().click().catch(() => {}); await W(1500)
    if (!(await sheet.count())) break
  }
} catch (e) { console.log('FAIL checkin', String(e).split('\n')[0].slice(0, 100)) }
for (const n of ['閉じる']) { const b = p.locator('.shop-sheet__close, .bs__close').first(); if (await b.count()) await b.click().catch(() => {}); await W(1000) }
await dismiss()
try {
  await p.getByRole('button', { name: 'メニュー' }).click({ timeout: 8000 }); await W(1500)
  await p.getByRole('button', { name: '記録', exact: true }).click({ timeout: 8000 }); await W(6000)
  await shot(p, `${P}-record-top`)
  await p.locator('.rc').first().evaluate((el) => { const s = el.closest('[class*="rc"]') ?? el; s.scrollTop = 700 }).catch(() => {})
  await p.mouse.wheel(0, 700); await W(1500); await shot(p, `${P}-record-scrolled`)
  console.log('OK record')
} catch (e) { console.log('FAIL record', String(e).split('\n')[0].slice(0, 100)) }
console.log('done'); process.exit(0)
