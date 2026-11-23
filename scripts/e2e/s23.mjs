import { open, text, shot, go, settle } from './lib.mjs'
const { ctx, p } = await open({ geo: { latitude: 35.6512, longitude: 139.6362 } })
const W = (ms) => p.waitForTimeout(ms)
await go(p, `/?fake=35.6512,139.6362&debug&day`, 3000); console.log('settled', await settle(p))
for (const n of ['あとで', 'スキップ', 'とじる']) { const b = p.getByRole('button', { name: n, exact: true }).first(); if (await b.count()) { await b.click().catch(() => {}); await W(1000) } }
await p.evaluate(() => { for (const d of document.querySelectorAll('div')) if (d.style.cssText.includes('font: 10px/1.25 monospace') || d.style.cssText.includes('font:10px/1.25 monospace')) d.parentElement.style.display = 'none' })
await p.locator('.bldg-pins--facility', { hasText: 'コルティ' }).first().locator('.bldg-pin').first().click({ force: true }); await W(2500)
const sheet = p.locator('[aria-label="ビルのお店"]')
const n = await sheet.locator('li').count(); console.log('items', n, await sheet.locator('li').allInnerTexts())
for (let i = 0; i < n; i++) {
  await sheet.locator('li').nth(i).click(); await W(2000)
  const b = p.getByRole('button', { name: /^チェックイン$/ }).first()
  if (await b.count() && await b.isEnabled()) {
    console.log('checkin on item', i)
    await b.click(); await W(1200); await shot(p, '15-checkin-effect'); await W(2500); await shot(p, '15d-checkin-band'); await W(4000); await shot(p, '15b-after-checkin')
    for (const nm of ['あとで']) { const x = p.getByRole('button', { name: nm, exact: true }).first(); if (await x.count()) { await x.click(); await W(1000) } }
    await shot(p, '15c-after-checkin-closed'); break
  }
  await p.getByRole('button', { name: /経堂コルティ/ }).first().click().catch(() => {}); await W(1500)
}
await ctx.close()
