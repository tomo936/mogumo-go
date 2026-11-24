// 記録の画面を、行ったお店がある状態で撮る（2026-11-24）。画面でのチェックインが不安定なので、
// ゲストで始めたあと、手元の Docker の DB に直接チェックインの行を足す（写真のあるお店を含む 4 件・2 日分）
import { execFileSync } from 'node:child_process'
import { open, go, shot } from './lib.mjs'
const P = process.env.OUT_NAME ?? 'x'
const { p } = await open({ fresh: true })
const W = (ms) => p.waitForTimeout(ms)
const { BASE } = await import('./lib.mjs')
await p.goto(BASE + '/', { waitUntil: 'domcontentloaded' }); await W(4000)
await p.locator('button.splash').click(); await W(2500)
await p.getByRole('button', { name: 'ゲストではじめる' }).click(); await W(6000)
if (!p.url().includes('/setup/name')) { await p.goto(BASE + '/setup/name'); await W(3000) }
await p.locator('#nickname').fill('しけんくん'); await p.getByRole('button', { name: '次へ' }).click(); await W(2500)
await p.locator('.cs__card').nth(1).click(); await W(500); await p.getByRole('button', { name: '次へ' }).click(); await W(6000)
await p.locator('.hs__ok').click(); await W(8000)
const uid = await p.evaluate(() => { for (const k of Object.keys(localStorage)) if (k.includes('auth-token')) { try { return JSON.parse(localStorage.getItem(k)).user.id } catch { /* */ } } return null })
console.log('uid', uid)
// 本物のチェックインと同じ SQL 関数 perform_checkin で入れる（晴れたマス・コインも書く）。マスはサーバーと同じ計算
const { cellsAround, CLEAR_M } = await import('../../supabase/functions/checkin/core.ts')
const psql = (q) => execFileSync('docker', ['exec', 'supabase_db_mogumo-go', 'psql', '-U', 'postgres', '-tAc', q]).toString().trim()
const shops = psql(`select shop_id||'|'||lat||'|'||lng from public.shops where lat between 35.645 and 35.657 and lng between 139.630 and 139.642 order by (shop_id like 'hp:%') desc, shop_id limit 4`).split('\n')
const days = ['2026-11-23', '2026-11-23', '2026-11-24', '2026-11-24']
shops.forEach((row, i) => {
  const [id, lat, lng] = row.split('|')
  const cells = JSON.stringify(cellsAround(Number(lat), Number(lng), CLEAR_M))
  console.log(psql(`select coins_awarded from public.perform_checkin('${uid}'::uuid, '${id}', false, '${days[i]}'::date, '${cells}'::jsonb, null)`), id)
})
await p.evaluate(() => { for (const k of Object.keys(localStorage)) if (k.startsWith('mogumo.guide')) localStorage.setItem(k, '1') })
await go(p, '/?fake=35.6512,139.6362&day', 40000)
const box = p.locator('[aria-label="ポコタンの案内"]')
for (let i = 0; i < 30 && await box.count(); i++) { await box.click({ position: { x: 300, y: 50 } }).catch(() => {}); await W(600) }
const dismiss = async () => { for (let i = 0; i < 3; i++) { const b = p.getByRole('button', { name: 'とじる', exact: true }).first(); if (!(await b.isVisible().catch(() => false))) break; await b.click().catch(() => {}); await W(1500) } }
await W(4000); await dismiss()
await p.getByRole('button', { name: 'メニュー' }).click({ timeout: 8000 }); await W(1500)
await p.getByRole('button', { name: '記録', exact: true }).click({ timeout: 8000 }); await W(8000)
await shot(p, `${P}-rec-top`)
await p.mouse.move(195, 600); await p.mouse.wheel(0, 650); await W(1500); await shot(p, `${P}-rec-mid`)
await p.mouse.wheel(0, 900); await W(1500); await shot(p, `${P}-rec-bottom`)
try {
  await p.getByRole('button', { name: 'カレンダー' }).click(); await W(2000); await shot(p, `${P}-rec-cal`)
  await p.locator('.rcal button.rcal__d').first().click(); await W(2500); await shot(p, `${P}-rec-cal-day`)
  await p.getByRole('button', { name: 'この日の地図を見る' }).click(); await W(2500)
  await p.getByRole('tab', { name: 'じっせき' }).click(); await W(3000); await shot(p, `${P}-rec-badges`)
  await p.locator('.rc__back').click(); await W(1500)
  await p.getByRole('button', { name: 'メニュー' }).click({ timeout: 8000 }); await W(1500)
  await p.getByRole('button', { name: '図鑑', exact: true }).click({ timeout: 8000 }); await W(6000)
  await p.getByRole('button', { name: 'すべて', exact: true }).click(); await W(2000); await shot(p, `${P}-zukan-all`)
  await p.getByRole('button', { name: /^訪問済み/ }).click(); await W(2000); await shot(p, `${P}-zukan-done`)
} catch (e) { console.log('FAIL extra', String(e).split('\n')[0].slice(0, 100)) }
console.log('done'); process.exit(0)
