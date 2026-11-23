import { open, text, shot, go, settle } from './lib.mjs'
const { ctx, p } = await open({ geo: { latitude: 35.6512, longitude: 139.6362 } })
const W = (ms) => p.waitForTimeout(ms)
const hide = () => p.evaluate(() => { for (const d of document.querySelectorAll('div')) if ((d.textContent || '').startsWith('dpr ') && d.children.length === 0) d.parentElement.style.display = 'none' })
const clear = async () => { for (const n of ['あとで', 'スキップ', 'とじる']) { const b = p.getByRole('button', { name: n, exact: true }).first(); if (await b.count()) { await b.click().catch(() => {}); await W(1000) } } }
const load = async (q) => { await go(p, `/?fake=35.6512,139.6362&debug&${q}`, 3000); console.log('settled', await settle(p)); await clear(); await hide(); await W(1500) }
const step = async (name, fn) => { try { await fn(); console.log('OK', name) } catch (e) { console.log('FAIL', name, String(e).split('\n')[0].slice(0, 120)) } }
await step('day', async () => { await load('day'); await shot(p, '06-map-day') })
await step('night', async () => { await load('night'); await shot(p, '07-map-night') })
await step('shop', async () => {
  await load('day')
  await p.getByRole('button', { name: '近くのお店' }).click(); await W(2500); await shot(p, '10-nearby-list')
  await p.getByText('叙々苑').first().click(); await W(2500); await shot(p, '11-shop-sheet-collapsed')
  await p.getByRole('button', { name: /くわしく見る/ }).first().click(); await W(2500); await shot(p, '12-shop-sheet-detail')
})
await step('building', async () => {
  await load('day')
  await p.locator('.bldg-pins--facility', { hasText: 'コルティ' }).first().locator('.bldg-pin').first().click({ force: true }); await W(2500)
  await shot(p, '13-building-list')
  const sheet = p.locator('[aria-label="ビルのお店"]'); const n = await sheet.locator('li').count()
  for (let i = 0; i < n; i++) {
    await sheet.locator('li').nth(i).click(); await W(2000)
    const b = p.getByRole('button', { name: /^チェックイン$/ }).first()
    if (await b.count() && await b.isEnabled()) {
      await shot(p, '14-shop-sheet-checkin-ready')
      await b.click(); await W(1200); await shot(p, '15-checkin-effect'); await W(7000); await shot(p, '15b-after-checkin')
      await clear(); await shot(p, '15c-after-checkin-closed'); return
    }
    await p.getByRole('button', { name: /経堂コルティ/ }).first().click().catch(() => {}); await W(1500)
  }
  console.log('no enabled checkin among', n)
})
await ctx.close()
