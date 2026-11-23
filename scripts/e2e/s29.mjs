// ガチャ（準備中）を押したら「ガチャは準備中です」が出るかを、押した直後から測る（2026-11-24）
import { open, shot, go } from './lib.mjs'
const { p } = await open({ fresh: true })
const W = (ms) => p.waitForTimeout(ms)
const { BASE } = await import('./lib.mjs')
await p.goto(BASE + '/', { waitUntil: 'domcontentloaded' }); await W(4000)
await p.locator('button.splash').click(); await W(2500)
await p.getByRole('button', { name: 'ゲストではじめる' }).click(); await W(6000)
if (!p.url().includes('/setup/name')) { await p.goto(BASE + '/setup/name'); await W(3000) }
await p.locator('#nickname').fill('しけんくん'); await p.getByRole('button', { name: '次へ' }).click(); await W(2500)
await p.locator('.cs__card').nth(1).click(); await W(500); await p.getByRole('button', { name: '次へ' }).click(); await W(6000)
await p.locator('.hs__ok').click(); await W(8000); console.log('after setup', p.url())
await p.evaluate(() => { for (const k of Object.keys(localStorage)) if (k.startsWith('mogumo.guide')) localStorage.setItem(k, '1') })
await go(p, '/?fake=35.6512,139.6362&day', 40000)
for (const n of ['あとで', 'スキップ', 'とじる']) { const b = p.getByRole('button', { name: n, exact: true }).first(); if (await b.count()) { await b.click().catch(() => {}); await W(800) } }
const box = p.locator('[aria-label="ポコタンの案内"]')
for (let i = 0; i < 30 && await box.count(); i++) { await box.click({ position: { x: 300, y: 50 } }).catch(() => {}); await W(600) }
for (let i = 0; i < 4; i++) { const b = p.getByRole('button', { name: 'とじる', exact: true }).first(); if (await b.count()) { await b.click().catch(() => {}); await W(1500) } }
await shot(p, '90-before-menu'); console.log('url', p.url())
await p.getByRole('button', { name: 'メニュー' }).click({ timeout: 8000 }); await W(1200)
await p.getByRole('button', { name: 'ガチャ', exact: true }).click()
const t0 = Date.now()
const toast = p.locator('.hud-soon')
await toast.waitFor({ state: 'visible', timeout: 3000 }).then(() => console.log('出た', Date.now() - t0, 'ms後:', 'ガチャは準備中です')).catch(() => console.log('出なかった'))
await shot(p, '90-gacha-soon')
const r = await toast.boundingBox().catch(() => null); console.log('場所', JSON.stringify(r))
await toast.waitFor({ state: 'detached', timeout: 4000 }).then(() => console.log('消えた', Date.now() - t0, 'ms後')).catch(() => console.log('消えない'))
process.exit(0)
