import { open, text, shot, go, settle } from './lib.mjs'
const { ctx, p, log } = await open({ geo: { latitude: 35.6512, longitude: 139.6362 } })
await go(p, '/?fake=35.6512,139.6362&debug', 3000); console.log('settled', await settle(p))
const later = p.getByRole('button', { name: 'あとで' }); if (await later.count()) await later.click()
const menu = async (name) => { await p.getByRole('button', { name: 'メニュー' }).click(); await p.waitForTimeout(1200); await p.getByRole('button', { name, exact: true }).click() }
const openSettings = async () => { await menu('設定'); await p.waitForTimeout(2500); return p.locator('[aria-label="設定"]').first() }
// お問い合わせを送る
let st = await openSettings()
await st.getByRole('button', { name: 'お問い合わせ・不具合の報告' }).click(); await p.waitForTimeout(2000)
const form = p.locator('section').last()
await form.getByText('不具合の報告').click().catch(() => {})
await form.locator('textarea').fill('結合試験の見本の問い合わせです。')
await form.getByRole('button', { name: '送る' }).click(); await p.waitForTimeout(3000); await shot(p, '11g-contact-sent')
console.log('[お問い合わせ]', (await form.innerText()).replace(/\s+/g, ' ').slice(0, 160))
await p.getByRole('button', { name: '戻る', exact: true }).last().click().catch(() => {}); await p.waitForTimeout(1500)
await p.getByRole('button', { name: '戻る', exact: true }).last().click().catch(() => {}); await p.waitForTimeout(1500)
// 12 退会
st = await openSettings()
await st.getByRole('button', { name: /退会/ }).click(); await p.waitForTimeout(2000); await shot(p, '12a-delete')
console.log('[12 退会]', (await p.locator('section').last().innerText()).replace(/\s+/g, ' ').slice(0, 220))
await p.locator('.ac__danger').first().click(); await p.waitForTimeout(1500); await shot(p, '12b-confirm')
console.log('  確認:', (await p.locator('[aria-label="本当に消しますか"]').innerText()).replace(/\s+/g, ' ').slice(0, 160))
await p.locator('[aria-label="本当に消しますか"] .ac__danger').click(); await p.waitForTimeout(8000); await shot(p, '12c-after-delete')
console.log('  消したあと:', p.url(), (await text(p)).slice(0, 160))
console.log('  localStorage mogumo keys:', await p.evaluate(() => Object.keys(localStorage).filter((k) => k.includes('mogumo') || k.includes('sb-'))))
await ctx.close(); console.log(log.slice(0, 10).join('\n'))
