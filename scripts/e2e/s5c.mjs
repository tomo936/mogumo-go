import { open, shot, go, settle } from './lib.mjs'
const { ctx, p } = await open({ geo: { latitude: 35.6512, longitude: 139.6362 } })
for (let run = 1; run <= 2; run++) {
  await go(p, '/?fake=35.6512,139.6362&debug', 2000); console.log('settled in', await settle(p), 's')
  const later = p.getByRole('button', { name: 'あとで' }); if (await later.count()) await later.click()
  const fac = p.locator('.bldg-pins--facility', { hasText: 'コルティ' }).first()
  const label = (await fac.innerText()).replace(/\s+/g, ' ')
  const z = (await p.locator('body').innerText()).match(/zoom [\d.]+/)?.[0]
  await fac.locator('.bldg-pin').first().click({ force: true }); await p.waitForTimeout(2500)
  const sheet = p.locator('[aria-label="ビルのお店"]')
  const head = (await sheet.locator('h2, header').first().innerText().catch(() => '')).replace(/\s+/g, ' ')
  const items = await sheet.locator('li').allInnerTexts()
  console.log(`run${run} ${z} 札「${label}」 一覧「${head}」 ${items.length} 軒: ${items.map((s) => s.replace(/\s+/g, ' ').slice(0, 18)).join(' | ')}`)
  if (run === 1) await shot(p, '5d-corty-after-checkins')
}
await ctx.close()
