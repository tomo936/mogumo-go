// 押せる範囲が 44×44px あるかを、実際の画面で確かめる（2026-11-24。src/ui/hitArea.css）
// ボタンの真ん中から ±21.5px の 4 隅と上下左右の 8 点で elementFromPoint が そのボタン（か中身）を返すか
import { open, go, shot } from './lib.mjs'
const { p } = await open({ fresh: true })
const W = (ms) => p.waitForTimeout(ms)
const { BASE } = await import('./lib.mjs')
await p.goto(BASE + '/', { waitUntil: 'domcontentloaded' }); await W(4000)
await p.locator('button.splash').click(); await W(2500)
await p.getByRole('button', { name: 'ゲストではじめる' }).click(); await W(6000)
if (!p.url().includes('/setup/name')) { await p.goto(BASE + '/setup/name'); await W(3000) }
await p.locator('#nickname').fill('しけんくん'); await p.getByRole('button', { name: '次へ' }).click(); await W(2500)
await p.locator('.cs__card').nth(1).click(); await W(500); await p.getByRole('button', { name: '次へ' }).click(); await W(6000)
const homeBack = await measure(['.hs__back'])
await p.locator('.hs__ok').click(); await W(8000)
await p.evaluate(() => { for (const k of Object.keys(localStorage)) if (k.startsWith('mogumo.guide')) localStorage.setItem(k, '1') })
await go(p, '/?fake=35.6512,139.6362&day', 40000)
for (let i = 0; i < 4; i++) for (const n of ['とじる', 'あとで', 'スキップ']) { const b = p.getByRole('button', { name: n, exact: true }).first(); if (await b.count()) { await b.click().catch(() => {}); await W(1200) } }
// ログインボーナスは地図に入ってから遅れて出る（出たら閉じる。最大 25 秒待つ）
{ const b = p.getByRole('button', { name: 'とじる', exact: true }).first(); await b.waitFor({ state: 'visible', timeout: 25000 }).then(() => b.click()).catch(() => {}); await W(1500) }
const box = p.locator('[aria-label="ポコタンの案内"]')
for (let i = 0; i < 30 && await box.count(); i++) { await box.click({ position: { x: 300, y: 50 } }).catch(() => {}); await W(600) }

async function measure(sels) {
  return p.evaluate((sels) => {
    const out = []
    for (const sel of sels) for (const el of document.querySelectorAll(sel)) {
      const r = el.getBoundingClientRect(); if (!r.width) continue
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2, d = 21.5
      const pts = [[-d, -d], [d, -d], [-d, d], [d, d], [0, -d], [0, d], [-d, 0], [d, 0]]
      const miss = pts.filter(([x, y]) => { const h = document.elementFromPoint(cx + x, cy + y); return !(h && (h === el || el.contains(h))) })
      out.push({ sel, size: `${Math.round(r.width)}x${Math.round(r.height)}`, ok: miss.length === 0, miss: miss.length, hitBy: miss.length ? [...new Set(miss.map(([x, y]) => { const h = document.elementFromPoint(cx + x, cy + y); return h ? (h.className?.baseVal ?? h.className ?? h.tagName).toString().slice(0, 30) : 'none' }))] : [] })
    }
    return out
  }, sels)
}
const all = [...homeBack]
const show = (rs) => { for (const r of rs) console.log(r.ok ? 'OK  ' : 'NG  ', r.sel, r.size, r.miss ? `外れ ${r.miss}/8 ${r.hitBy.join(',')}` : '') }
show(homeBack); console.log('map ready', Date.now())
// ログインボーナスは案内を閉じたあとに出る。測る前に毎回、出ていれば閉じる
const dismiss = async () => { for (let i = 0; i < 3; i++) { const b = p.getByRole('button', { name: 'とじる', exact: true }).first(); if (!(await b.isVisible().catch(() => false))) break; await b.click().catch(() => {}); await W(1500) } }
await W(4000); await dismiss()
const step = async (name, fn) => { const n0 = all.length; await dismiss(); try { await fn() } catch (e) { console.log('FAIL', name, String(e).split('\n')[0].slice(0, 120)); await shot(p, 'x-s31-' + name).catch(() => {}) } show(all.slice(n0)) }
await step('map', async () => all.push(...await measure(['.pins-toggle'])))
const menu = async (name) => { await p.getByRole('button', { name: 'メニュー' }).click({ timeout: 8000 }); await W(1200); await p.getByRole('button', { name, exact: true }).click({ timeout: 8000 }); await W(3500) }
await step('zukan', async () => { await menu('図鑑'); all.push(...await measure(['.zukan__close', '.zukan__tab', '.zukan__pager button'])); await p.locator('.zukan__close').click(); await W(1500) })
await step('record', async () => { await menu('記録'); all.push(...await measure(['.rc__back', '.rc__slider-head button'])); await p.locator('.rc__back').click(); await W(1500) })
await step('mypage', async () => { await menu('マイページ'); all.push(...await measure(['.mp__back'])); await p.locator('.mp__back').click(); await W(1500) })
await step('settings', async () => { await menu('設定'); all.push(...await measure(['.st__back'])); await p.locator('.st__back').first().click(); await W(1500) })
await step('nearby', async () => { await p.locator('.hud-nearby').click(); await W(2500); all.push(...await measure(['.nb__back'])); await p.locator('.nb__back').click(); await W(1500) })
await step('inbox', async () => { await p.locator('.hud-inbox').click(); await W(2500); all.push(...await measure(['.ib__back'])); await p.locator('.ib__back').first().click(); await W(1500) })
await step('chars', async () => { await p.locator('.hud-player, [aria-label*="キャラを変える"]').first().click(); await W(2500); all.push(...await measure(['.cl__back'])); await p.locator('.cl__back').click(); await W(1500) })
console.log('done')
process.exit(0)
