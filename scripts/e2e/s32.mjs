// 画面を順に撮る（前後の比較用。OUT_NAME を名前の頭に付ける。2026-11-24）
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
await p.evaluate(() => { for (const k of Object.keys(localStorage)) if (k.startsWith('mogumo.guide')) localStorage.setItem(k, '1') })
await go(p, '/?fake=35.6512,139.6362&day', 40000)
const box = p.locator('[aria-label="ポコタンの案内"]')
for (let i = 0; i < 30 && await box.count(); i++) { await box.click({ position: { x: 300, y: 50 } }).catch(() => {}); await W(600) }
const dismiss = async () => { for (let i = 0; i < 3; i++) { const b = p.getByRole('button', { name: 'とじる', exact: true }).first(); if (!(await b.isVisible().catch(() => false))) break; await b.click().catch(() => {}); await W(1500) } }
await W(4000); await dismiss()
const step = async (name, fn) => { await dismiss(); try { await fn(); console.log('OK', name) } catch (e) { console.log('FAIL', name, String(e).split('\n')[0].slice(0, 100)) } }
const menu = async (name) => { await p.getByRole('button', { name: 'メニュー' }).click({ timeout: 8000 }); await W(1500); if (name) { await p.getByRole('button', { name, exact: true }).click({ timeout: 8000 }); await W(3500) } }
await step('map', async () => { await shot(p, `${P}-01-map`) })
await step('fan', async () => { await menu(); await shot(p, `${P}-02-fan`); await p.getByRole('button', { name: '閉じる' }).click(); await W(1200) })
await step('explore', async () => { await p.locator('.hud-hint').click(); await W(3500); await shot(p, `${P}-03-explore`); await p.locator('.hud-hint').click(); await W(1500) })
await step('zukan', async () => { await menu('図鑑'); await shot(p, `${P}-04-zukan`); await p.locator('.zukan__close').click(); await W(1500) })
await step('record', async () => { await menu('記録'); await shot(p, `${P}-05-record`); await p.locator('.rc__back').click(); await W(1500) })
await step('settings', async () => { await menu('設定'); await shot(p, `${P}-06-settings`); await p.locator('.st__back').first().click(); await W(1500) })
await step('inbox', async () => { await p.locator('.hud-inbox').click(); await W(3000); await shot(p, `${P}-07-inbox`); await p.locator('.ib__back').first().click(); await W(1500) })
console.log('done'); process.exit(0)
