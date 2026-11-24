// 新宿駅のまわり半径 R m を晴れにして、最大まで寄って 1 周見まわし、向きごとに 1 コマの頂点の数と画面を撮る（2026-11-24 オーナー「重くない？」）
import { execFileSync } from 'node:child_process'
import { open, go, shot } from './lib.mjs'
const P = process.env.OUT_NAME ?? 'x'
const C = { lat: 35.6896, lng: 139.7006 } // 新宿駅
const R = Number(process.env.R ?? 1000)
const { p } = await open({ fresh: true, geo: { latitude: C.lat, longitude: C.lng } })
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
console.log(psql(`select coins_awarded from public.perform_checkin('${uid}'::uuid, 'hp:E2E0001', false, '2026-11-24'::date, '${JSON.stringify(cellsAround(C.lat, C.lng, R))}'::jsonb, null)`), 'cells', cellsAround(C.lat, C.lng, R).length)
await p.addInitScript(() => {
  const w = window; w.__gl = { verts: 0 }
  for (const K of [window.WebGL2RenderingContext, window.WebGLRenderingContext]) {
    if (!K) continue
    const Pr = K.prototype
    const wrap = (name, cnt) => { const o = Pr[name]; if (!o) return; Pr[name] = function (...a) { w.__gl.verts += cnt(a); return o.apply(this, a) } }
    wrap('drawElements', (a) => a[1]); wrap('drawArrays', (a) => a[2]); wrap('drawElementsInstanced', (a) => a[1] * a[4]); wrap('drawArraysInstanced', (a) => a[2] * a[3])
  }
})
await p.evaluate(() => { for (const k of Object.keys(localStorage)) if (k.startsWith('mogumo.guide')) localStorage.setItem(k, '1') })
await go(p, `/?fake=${C.lat},${C.lng}&${process.env.MODE ?? 'day'}&debug${process.env.Q ?? ''}`, 40000)
const box = p.locator('[aria-label="ポコタンの案内"]')
for (let i = 0; i < 30 && await box.count(); i++) { await box.click({ position: { x: 300, y: 50 } }).catch(() => {}); await W(600) }
const dismiss = async () => { for (let i = 0; i < 3; i++) { const b = p.getByRole('button', { name: 'とじる', exact: true }).first(); if (!(await b.isVisible().catch(() => false))) break; await b.click().catch(() => {}); await W(1500) } }
await W(4000); await dismiss()
await p.waitForFunction(() => window.__mogumoMap && window.__mogumoMap.getMinZoom() >= 16, null, { timeout: 90000 }).catch(() => {})
await W(8000)
for (const h of (process.env.HIDES ?? '').split('|')) {
await p.evaluate((h) => { const m = window.__mogumoMap; for (const id of (window.__hide ?? [])) if (m.getLayer(id)) m.setLayoutProperty(id, 'visibility', 'visible'); window.__hide = h ? h.split(',') : [] }, h)
console.log('== hide', h || '(none)')
for (const z of (process.env.ZOOMS ?? '19').split(',').map(Number)) for (const b of (process.env.BEARINGS ?? '0,90,180,270').split(',').map(Number)) {
  const r = await p.evaluate(async ([z, b]) => {
    const m = window.__mogumoMap; for (const id of (window.__hide ?? [])) if (m.getLayer(id)) m.setLayoutProperty(id, 'visibility', 'none'); m.jumpTo({ zoom: Math.min(z, m.getMaxZoom()), bearing: b }); await new Promise((r) => setTimeout(r, 6000))
    let f = 0; const on = () => f++; m.on('render', on); window.__gl.verts = 0
    for (let i = 0; i < 8; i++) { m.triggerRepaint(); await new Promise((r) => requestAnimationFrame(r)) }
    await new Promise((r) => setTimeout(r, 200)); m.off('render', on)
    return { z: m.getZoom(), pitch: Math.round(m.getPitch()), b, kVerts: Math.round(window.__gl.verts / f / 1000) }
  }, [z, b])
  console.log(JSON.stringify(r)); await shot(p, `${P}-z${z}-b${b}`)
}
}
if (process.env.TAP) {
  // 模型を押してお店のシートが開くか（詰めた並びで店を引けるか）
  const [x, y] = process.env.TAP.split(',').map(Number)
  await p.evaluate(() => window.__mogumoMap.jumpTo({ zoom: 19, bearing: 0 })); await W(6000)
  await shot(p, `${P}-tap-before`)
  await p.mouse.click(x, y); await W(8000)
  console.log('sheet', (await p.locator('[role=dialog], [class*=sheet]').allInnerTexts().catch(() => [])).join(' # ').slice(0, 200).replace(/\n/g, ' / '))
  await shot(p, `${P}-tap-after`)
}
console.log('done'); process.exit(0)
