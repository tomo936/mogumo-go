import { open, BASE, text, shot, go } from './lib.mjs'
const { ctx, p, log } = await open({ geo: { latitude: 35.6450, longitude: 139.6400 } })
await go(p, '/setup/name')
await p.locator('#nickname').fill('しけんくん')
await shot(p, '3a-name'); await p.getByRole('button', { name: '次へ' }).click(); await p.waitForTimeout(2500)
console.log('[3b]', p.url(), await text(p))



await p.locator('.cs__card').nth(1).click(); await p.waitForTimeout(500)
await shot(p, '3b-character'); await p.getByRole('button', { name: '次へ' }).click(); await p.waitForTimeout(6000)
console.log('[3c]', p.url(), await text(p))
await shot(p, '3c-home')
const ok = p.locator('.hs__ok'); console.log('home ok enabled', await ok.isEnabled())
await ok.click(); await p.waitForTimeout(8000)
console.log('[3d]', p.url(), await text(p))
await shot(p, '3d-after-setup')
await ctx.close(); console.log(log.join('\n'))
