import { open, shot, go, settle } from './lib.mjs'
const { ctx, p, log } = await open({ geo: { latitude: 35.6512, longitude: 139.6362 } })
await go(p, '/?fake=35.6512,139.6362&debug', 3000); console.log('settled', await settle(p))
const later = p.getByRole('button', { name: 'あとで' }); if (await later.count()) await later.click()
const menu = async (name) => { await p.getByRole('button', { name: 'メニュー' }).click(); await p.waitForTimeout(1200); await p.getByRole('button', { name, exact: true }).click() }
const openSettings = async () => { await menu('設定'); await p.waitForTimeout(2500); return p.locator('[aria-label="設定"]').first() }
for (const [name, file] of [['利用規約', '11d-terms'], ['お問い合わせ・不具合の報告', '11e-contact']]) {
  const st = await openSettings()
  await st.getByRole('button', { name }).click(); await p.waitForTimeout(2500); await shot(p, file)
  console.log(`  ${name}:`, (await p.locator('section').last().innerText()).replace(/\s+/g, ' ').slice(0, 200))
  await p.getByRole('button', { name: '戻る', exact: true }).last().click(); await p.waitForTimeout(1500)
  await p.getByRole('button', { name: '戻る', exact: true }).last().click().catch(() => {}); await p.waitForTimeout(1500)
}
const st = await openSettings()
await st.getByText(/バージョン/).scrollIntoViewIfNeeded(); await p.waitForTimeout(800); await shot(p, '11f-version')
console.log('  バージョン:', (await st.innerText()).match(/バージョン.{0,30}/)?.[0])
await ctx.close(); console.log(log.slice(0, 10).join('\n'))
