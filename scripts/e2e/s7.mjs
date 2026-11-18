import { open, text, shot, go, settle } from './lib.mjs'
const { ctx, p, log } = await open({ geo: { latitude: 35.6512, longitude: 139.6362 } })
await go(p, '/?fake=35.6512,139.6362&debug', 3000); console.log('settled', await settle(p))
const later = p.getByRole('button', { name: 'あとで' }); if (await later.count()) await later.click()
const menu = async (name) => { await p.getByRole('button', { name: 'メニュー' }).click(); await p.waitForTimeout(1200); await p.getByRole('button', { name, exact: true }).click(); await p.waitForTimeout(5000) }
// 図鑑
await menu('図鑑'); await shot(p, '7a-zukan')
const z = p.locator('[aria-label="図鑑"]')
console.log('[7 図鑑]', (await z.innerText()).replace(/\s+/g, ' ').slice(0, 260))
console.log('  行ったカード:', await z.locator('[aria-label$="回行った"]').evaluateAll((e) => e.map((x) => x.getAttribute('aria-label'))))
await z.getByRole('button', { name: '閉じる' }).first().click(); await p.waitForTimeout(1500)
// 記録
await menu('記録'); await p.waitForTimeout(4000); await shot(p, '7b-record')
const r = p.locator('[aria-label="記録"]')
console.log('[7 記録]', (await r.innerText()).replace(/\s+/g, ' ').slice(0, 260))
await r.getByRole('tab', { name: /じっせき/ }).click().catch((e) => console.log('  じっせき tab?', String(e).slice(0, 80))); await p.waitForTimeout(2000); await shot(p, '7c-badges')
console.log('[7 じっせき]', (await r.innerText()).replace(/\s+/g, ' ').slice(0, 200))
await r.getByRole('tab', { name: /きろく/ }).click().catch(() => {}); await p.waitForTimeout(1500)
await r.getByRole('button', { name: 'ワールドマップ' }).click(); await p.waitForTimeout(6000); await shot(p, '7d-worldmap')
console.log('[7 ワールドマップ]', (await text(p)).slice(0, 220))
await ctx.close(); console.log(log.filter((l) => !l.includes('favicon')).slice(0, 12).join('\n'))
