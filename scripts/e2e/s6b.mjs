import { open, text, shot, go } from './lib.mjs'
const { ctx, p, log } = await open({ geo: { latitude: 35.6512, longitude: 139.6362 } })
await go(p, '/?fake=35.6512,139.6362', 32000)
const later = p.getByRole('button', { name: 'あとで' }); if (await later.count()) await later.click()
// 見本カフェのピンは symbol レイヤーなので、気配シートではなく近くのお店の一覧から開く
await p.getByRole('button', { name: '近くのお店' }).click(); await p.waitForTimeout(2000)
console.log('[nearby]', (await text(p)).slice(0, 300))
await p.getByText('スターバックス').first().click(); await p.waitForTimeout(2000)
console.log('[sheet]', (await text(p)).slice(0, 200))
await p.getByRole('button', { name: /チェックイン/ }).first().click()
for (const ms of [300, 700, 1200, 2500]) { await p.waitForTimeout(ms === 300 ? 300 : ms - [300, 700, 1200][[700, 1200, 2500].indexOf(ms)]); await shot(p, `6d-effect-${ms}ms`) }
console.log('effect DOM:', await p.locator('[class*=confetti], [class*=effect], [class*=banner], [class*=ribbon]').evaluateAll((els) => els.map((e) => e.className).slice(0, 8)))
await p.waitForTimeout(4000); console.log('[after]', (await text(p)).slice(0, 200))
await ctx.close(); console.log(log.join('\n'))
