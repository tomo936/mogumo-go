// UI/UX 点検の撮影（2026-11-23）。E2E_OUT に 番号-画面名.png
import { open, text, shot, go, settle, BASE } from './lib.mjs'
import fs from 'node:fs'
fs.mkdirSync(process.env.E2E_OUT, { recursive: true })
const { ctx, p, log } = await open({ fresh: true, geo: { latitude: 35.6512, longitude: 139.6362 } })
const notes = []
const step = async (name, fn) => { try { await fn(); console.log('OK  ', name) } catch (e) { console.log('FAIL', name, String(e).split('\n')[0].slice(0, 160)); notes.push(name); await shot(p, 'x-fail-' + name.replace(/\W/g, '')).catch(() => {}) } }
const W = (ms) => p.waitForTimeout(ms)
const bk = async (n = 1) => { for (let i = 0; i < n; i++) { await p.getByRole('button', { name: '戻る', exact: true }).last().click().catch(() => {}); await W(1200) } }
const menu = async (name) => { await p.getByRole('button', { name: 'メニュー' }).click(); await W(1200); if (name) { await p.getByRole('button', { name, exact: true }).click(); await W(2500) } }
const clearPop = async () => { for (const n of ['あとで', 'スキップ', 'とじる', '閉じる']) { const b = p.getByRole('button', { name: n, exact: true }).first(); if (await b.count()) { await b.click().catch(() => {}); await W(1000) } } }

await step('title', async () => { await p.goto(BASE + '/', { waitUntil: 'domcontentloaded' }); await W(5000); await shot(p, '01-title') })
await step('login', async () => { await p.locator('button.splash').click(); await W(2500); await shot(p, '02-login') })
await step('setup', async () => {
  await p.getByRole('button', { name: 'ゲストではじめる' }).click(); await W(6000)
  if (!p.url().includes('/setup/name')) { await p.goto(BASE + '/setup/name'); await W(3000) }
  await p.locator('#nickname').fill('しけんくん'); await shot(p, '03-setup-name')
  await p.getByRole('button', { name: '次へ' }).click(); await W(2500)
  await p.locator('.cs__card').nth(1).click(); await W(500); await shot(p, '04-setup-character')
  await p.getByRole('button', { name: '次へ' }).click(); await W(6000); await shot(p, '05-setup-home')
  await p.locator('.hs__ok').click(); await W(3000)
})
await step('guide', async () => {
  for (let i = 0; i < 60 && !(await p.locator('[aria-label="ポコタンの案内"]').count()); i++) await W(1000)
  await W(2500); await shot(p, '08-guide-page1')
  const box = p.locator('[aria-label="ポコタンの案内"]')
  for (let i = 0; i < 20 && await box.count(); i++) { await box.click({ position: { x: 300, y: 50 } }).catch(() => {}); await W(1800) }
  await W(3000); await shot(p, '09-login-bonus')
  await clearPop()
})
const mapUrl = (q) => `/?fake=35.6512,139.6362&${q}`
await step('map-day', async () => { await go(p, mapUrl('day'), 36000); await clearPop(); await W(2000); await shot(p, '06-map-day') })
await step('map-night', async () => { await go(p, mapUrl('night'), 36000); await clearPop(); await W(2000); await shot(p, '07-map-night') })
await step('back-day', async () => { await go(p, mapUrl('day'), 36000); await clearPop() })

await step('nearby', async () => { await p.getByRole('button', { name: '近くのお店' }).click(); await W(2500); await shot(p, '10-nearby-list') })
await step('shop-sheet', async () => {
  await p.getByText('叙々苑').first().click(); await W(2500); await shot(p, '11-shop-sheet-collapsed')
  const d = p.getByRole('button', { name: /くわしく|詳しく|詳細/ }).first()
  if (await d.count()) { await d.click(); await W(2500) } else { await p.mouse.move(195, 560); await p.mouse.down(); await p.mouse.move(195, 120, { steps: 8 }); await p.mouse.up(); await W(2000) }
  await shot(p, '12-shop-sheet-detail')
  console.log('[sheet]', (await text(p)).slice(0, 300))
})
await step('review-guest', async () => {
  const rv = p.getByRole('button', { name: /感想/ }); console.log('review btns', await rv.count())
  await rv.first().click(); await W(2000); await shot(p, '16-review-guest-blocked')
  await p.locator('.lp').getByRole('button', { name: 'やめる' }).click().catch(() => {}); await W(1000)
})
await step('shop-close', async () => { await p.locator('.shop-sheet__close, [aria-label="閉じる"]').first().click().catch(() => {}); await W(1500) })
await step('building', async () => {
  await go(p, mapUrl('day'), 36000); await clearPop()
  await p.locator('.bldg-pins--facility', { hasText: 'コルティ' }).first().locator('.bldg-pin').first().click({ force: true }); await W(2500)
  await shot(p, '13-building-list')
  await p.locator('[aria-label="ビルのお店"] li', { hasText: '見本ラーメン' }).click(); await W(2500)
  await shot(p, '14-shop-sheet-ramen')
  await p.getByRole('button', { name: /^チェックイン$/ }).first().click(); await W(1500); await shot(p, '15-checkin-effect')
  await W(5000); await shot(p, '15b-after-checkin')
  console.log('[checkin]', (await text(p)).slice(0, 200))
})
await step('review-editor-and-list', async () => {
  console.log('[sheet btns]', await p.getByRole('button').evaluateAll((e) => e.map((x) => x.getAttribute('aria-label') || x.innerText).filter(Boolean).slice(0, 30)))
  const all = p.getByRole('button', { name: /みんなの感想/ }); if (await all.count()) { await all.first().click(); await W(3000); await shot(p, '17-all-reviews') ; await bk() }
})
await step('close-shop2', async () => { await p.locator('.shop-sheet__close, [aria-label="閉じる"]').first().click().catch(() => {}); await W(1500) })

await step('explore', async () => { await p.locator('.hud-hint').click(); await W(7000); await shot(p, '20-explore') })
await step('missions', async () => {
  const ex = p.locator('[aria-label="探索"]')
  for (let t = 0; t < 40 && /ミッションを読んでいます/.test(await ex.innerText()); t++) await W(1000)
  await ex.locator('.explore-sheet__scroll').evaluate((e) => e.scrollTo(0, e.scrollHeight)).catch(() => {}); await W(800); await shot(p, '21-missions')
  await ex.getByRole('button', { name: /閉じる/ }).first().click(); await W(1500)
})
await step('inbox', async () => {
  await p.locator('.hud-inbox').click(); await W(3000); await shot(p, '22-notices')
  await p.getByRole('tab', { name: /プレゼント/ }).click().catch(() => p.getByText(/^プレゼント/).first().click()); await W(2500); await shot(p, '23-presents')
  await p.locator('[aria-label="お知らせとプレゼント"]').getByRole('button', { name: '戻る' }).click(); await W(2500)
})
await step('menu', async () => { await menu(); await shot(p, '30-menu-fan') })
await step('zukan', async () => {
  await p.getByRole('button', { name: '図鑑', exact: true }).click(); await W(5000); await shot(p, '31-zukan')
  const z = p.locator('[aria-label="図鑑"]')
  await z.locator('[aria-label$="回行った"]').first().click().catch(() => {}); await W(1500)
  await z.locator('[aria-label="まだ行っていないお店のヒント"]').first().click().catch(() => {}); await W(1500); await shot(p, '32-zukan-card-detail')
  await z.getByRole('button', { name: '閉じる' }).first().click(); await W(1500)
})
await step('record', async () => {
  await menu('記録'); await W(4000); await shot(p, '33-record')
  const r = p.locator('[aria-label="記録"]')
  await r.getByRole('tab', { name: /じっせき/ }).click(); await W(2000); await shot(p, '34-badges')
  await r.getByRole('tab', { name: /きろく/ }).click(); await W(1500)
  await r.getByRole('button', { name: '町の範囲を出す' }).click().catch(() => {}); await W(3500); await shot(p, '35-record-towns')
  await r.getByRole('button', { name: 'ワールドマップ' }).click(); await W(6000); await shot(p, '36-worldmap')
  const s = p.getByRole('button', { name: /地名|検索/ }).first(); if (await s.count()) { await s.click(); await W(1500) }
  const inp = p.locator('input[type="search"], input[type="text"]').last(); if (await inp.count()) { await inp.fill('京都'); await W(4000) }
  await shot(p, '37-place-search')
})
await step('after-world', async () => { await go(p, mapUrl('day'), 36000); await clearPop() })
await step('mypage', async () => { await menu('マイページ'); await shot(p, '40-mypage'); await bk() })
await step('settings', async () => {
  await menu('設定'); await shot(p, '41-settings')
  for (const [name, f] of [['プライバシーポリシー', '42-privacy'], ['利用規約', '43-terms'], ['お問い合わせ・不具合の報告', '44-contact']]) {
    await p.locator('[aria-label="設定"]').first().getByRole('button', { name }).click(); await W(2500); await shot(p, f); await bk()
  }
  await p.locator('[aria-label="設定"]').first().getByRole('button', { name: /退会/ }).click(); await W(2000); await shot(p, '45-delete')
  await p.locator('.ac__danger').first().click(); await W(1500); await shot(p, '46-delete-confirm')
})
await step('reload-map', async () => { await go(p, mapUrl('day'), 36000); await clearPop() })
await step('charlist', async () => { await p.getByRole('button', { name: /キャラを変える/ }).click(); await W(6000); await shot(p, '50-charlist'); await p.locator('[aria-label="キャラ"]').getByRole('button', { name: '戻る' }).click(); await W(2500) })
await step('gacha', async () => { await menu(); await p.getByRole('button', { name: 'ガチャ', exact: true }).click({ force: true }); await W(2000); await shot(p, '51-gacha') })
console.log('failed:', notes.join(','), '\n' + [...new Set(log)].slice(0, 25).join('\n'))
await ctx.close()
