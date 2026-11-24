// 霧をはさんだ 2 か所の晴れた場所を作り、片方からもう片方を寄って見る（霧の向こうの家が雲の上に浮かないか。2026-11-24）（2026-11-24）。画面でのチェックインが不安定なので、
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
// 霧をはさんで離れた 2 か所（南の hp:E2E0001 と、北へ約 570m の osm:35436592931）
for (const id of ['hp:E2E0001', process.env.FAR_SHOP ?? 'osm:43395476201']) {
  const [lat, lng] = psql(`select lat||'|'||lng from public.shops where shop_id='${id}'`).split('|').map(Number)
  console.log(psql(`select coins_awarded from public.perform_checkin('${uid}'::uuid, '${id}', false, '2026-11-24'::date, '${JSON.stringify(cellsAround(lat, lng, CLEAR_M))}'::jsonb, null)`), id)
}
await p.evaluate(() => { for (const k of Object.keys(localStorage)) if (k.startsWith('mogumo.guide')) localStorage.setItem(k, '1') })
await go(p, '/?fake=35.65135,139.63605&night&debug', 40000)
const box = p.locator('[aria-label="ポコタンの案内"]')
for (let i = 0; i < 30 && await box.count(); i++) { await box.click({ position: { x: 300, y: 50 } }).catch(() => {}); await W(600) }
const dismiss = async () => { for (let i = 0; i < 3; i++) { const b = p.getByRole('button', { name: 'とじる', exact: true }).first(); if (!(await b.isVisible().catch(() => false))) break; await b.click().catch(() => {}); await W(1500) } }
await W(4000); await dismiss()
await p.waitForFunction(() => window.__mogumoMap && window.__mogumoMap.getMinZoom() >= 16, null, { timeout: 90000 }).catch(() => {})
for (const z of [18, 19]) {
  await p.evaluate(([z, b]) => window.__mogumoMap.jumpTo({ zoom: z, bearing: b }), [z, Number(process.env.BEARING ?? -39)]); await W(7000)
  await shot(p, `${P}-fogpocket-z${z}`)
}
console.log('done'); process.exit(0)
