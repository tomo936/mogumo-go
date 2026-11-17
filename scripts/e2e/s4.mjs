import { open, text, shot, go } from './lib.mjs'
const { ctx, p, log } = await open({ geo: { latitude: 35.6450, longitude: 139.6400 } })
await go(p, '/?debug', 7000)
await shot(p, '4a-guide')
console.log('[4a]', await text(p))
const box = p.locator('[aria-label="ポコタンの案内"]')
const seen = []
for (let i = 0; i < 20 && await box.count(); i++) {
  const t = (await box.innerText()).replace(/\s+/g, ' ')
  if (seen.at(-1) !== t) seen.push(t)
  await box.click({ position: { x: 300, y: 50 } }).catch(() => {})
  await p.waitForTimeout(1800)
}
console.log('guide pages:\n  ' + seen.join('\n  '))
await p.waitForTimeout(3000)
await shot(p, '4b-after-guide')
console.log('[4b]', await text(p))
console.log('canvas count', await p.locator('canvas').count())
await ctx.close(); console.log(log.join('\n'))
