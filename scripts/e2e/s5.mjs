import { open, text, shot, go } from './lib.mjs'
const { ctx, p, log } = await open({ geo: { latitude: 35.6512, longitude: 139.6362 } })
for (let run = 1; run <= 3; run++) {
  await go(p, '/?fake=35.6512,139.6362&debug', 32000)
  const bonus = p.getByRole('button', { name: 'とじる' }); if (await bonus.count()) { await bonus.click(); await p.waitForTimeout(1000) }
  if (run === 1) await shot(p, '5a-map-kyodo')
  const names = await p.locator('.bldg-name').allInnerTexts()
  const fac = await p.locator('.bldg-pins--facility').count()
  const bl = await p.locator('.bldg-pins').count()
  console.log(`[5 run${run}] buildings ${bl} facilities ${fac} names: ${names.join(', ')}`)
  const corty = p.locator('.bldg-pins--facility', { hasText: 'コルティ' })
  if (await corty.count()) {
    await corty.first().locator('.bldg-pin').first().click({ force: true }); await p.waitForTimeout(2500)
    const sheet = p.locator('[aria-label="ビルのお店"]')
    if (await sheet.count()) {
      const items = await sheet.locator('li').allInnerTexts()
      console.log(`  コルティのシート: ${items.length} 軒 → ${items.map((s) => s.replace(/\s+/g, ' ').slice(0, 24)).join(' | ')}`)
      if (run === 1) await shot(p, '5b-corty-sheet')
      await sheet.getByRole('button', { name: '閉じる' }).click(); await p.waitForTimeout(1500)
    } else { console.log('  sheet not opened:', await text(p)) ; await shot(p, `5x-corty-nosheet-${run}`) }
  } else console.log('  コルティの印が無い')
}
await ctx.close(); console.log(log.join('\n'))
