import { open, text, shot, go, settle } from './lib.mjs'
const { ctx, p, log } = await open({ geo: { latitude: 35.6512, longitude: 139.6362 } })
const W = (ms) => p.waitForTimeout(ms)
const step = async (name, fn) => { try { await fn(); console.log('OK  ', name) } catch (e) { console.log('FAIL', name, String(e).split('\n')[0].slice(0, 160)); await shot(p, 'x-fail2-' + name).catch(() => {}) } }
const clearPop = async () => { for (const n of ['あとで', 'スキップ', 'とじる', '閉じる']) { const b = p.getByRole('button', { name: n, exact: true }).first(); if (await b.count()) { await b.click().catch(() => {}); await W(1000) } } }
const load = async (q) => { await go(p, `/?fake=35.6512,139.6362&debug&${q}`, 3000); console.log('settled', await settle(p)); await clearPop(); await W(2000); await p.evaluate(() => { for (const d of document.querySelectorAll('div')) if (d.style.cssText.includes('font: 10px/1.25 monospace') || d.style.cssText.includes('font:10px/1.25 monospace')) d.parentElement.style.display = 'none' }) }
await step('map-day', async () => { await load('day'); await shot(p, '06-map-day') })
await step('map-night', async () => { await load('night'); await shot(p, '07-map-night') })
await step('nearby', async () => { await load('day'); await p.getByRole('button', { name: '近くのお店' }).click(); await W(2500); await shot(p, '10-nearby-list') })
await step('shop', async () => {
  await p.getByText('叙々苑').first().click(); await W(2500); await shot(p, '11-shop-sheet-collapsed')
  const d = p.getByRole('button', { name: /くわしく|詳しく|詳細/ }).first()
  console.log('detail btn', await d.count())
  if (await d.count()) { await d.click(); await W(2500) } else { await p.mouse.move(195, 560); await p.mouse.down(); await p.mouse.move(195, 120, { steps: 8 }); await p.mouse.up(); await W(2000) }
  await shot(p, '12-shop-sheet-detail')
})
await step('building', async () => {
  await load('day')
  await p.locator('.bldg-pins--facility', { hasText: 'コルティ' }).first().locator('.bldg-pin').first().click({ force: true }); await W(2500)
  await shot(p, '13-building-list')
  await p.locator('[aria-label="ビルのお店"] li', { hasText: '見本ラーメン' }).click(); await W(2500)
  await shot(p, '14-shop-sheet-ramen')
  console.log('[sheet]', (await text(p)).slice(0, 300))
  console.log('btns', await p.getByRole('button').evaluateAll((e) => e.map((x) => x.getAttribute('aria-label') || x.innerText.trim()).filter(Boolean)))
  await p.getByRole('button', { name: /^チェックイン$/ }).first().click(); await W(1500); await shot(p, '15-checkin-effect')
  await W(6000); await shot(p, '15b-after-checkin'); await clearPop(); await W(1500); await shot(p, '15c-after-checkin-closed')
})
await step('review', async () => {
  const rv = p.getByRole('button', { name: /感想/ }); console.log('review btns', await rv.count())
  await rv.first().click({ timeout: 8000 }); await W(2000); await shot(p, '16-review-guest-blocked')
  await p.locator('.lp').getByRole('button', { name: 'やめる' }).click().catch(() => {}); await W(1000)
})
console.log([...new Set(log)].slice(0, 15).join('\n'))
await ctx.close()
