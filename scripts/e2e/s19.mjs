// オーナーの手順（2026-11-23「ログアウトしてから再度ゲストでログインだとまだだめ」）:
// 新しいゲストで始める → 地図（降りる → ポコタン）→ 設定からログアウト → もう一度ゲストではじめる → 初回設定 → 地図。
// 2 回目の地図で、空から降りるか（ズームが 3 ほど上がり、傾きが 0 → 55）と、降り終わり→案内の間を測る。
import { open, BASE } from './lib.mjs'
const lat = 35.6512, lng = 139.6362
const { ctx, p } = await open({ fresh: true, geo: { latitude: lat, longitude: lng } })
const read = () => p.evaluate(() => { const m = document.body.innerText.match(/zoom ([\d.]+) pitch ([\d.]+)/); return m ? [+m[1], +m[2], !!document.querySelector('.guide:not(.guide--standby)')] : null }).catch(() => null)
async function setup() {
  await p.getByRole('button', { name: 'ゲストではじめる' }).click(); await p.waitForTimeout(6000)
  if (!p.url().includes('/setup/name')) { await p.goto(BASE + '/setup/name'); await p.waitForTimeout(3000) }
  await p.locator('#nickname').fill('しけんくん'); await p.getByRole('button', { name: '次へ' }).click(); await p.waitForTimeout(2500)
  await p.locator('.cs__card').nth(1).click(); await p.waitForTimeout(500); await p.getByRole('button', { name: '次へ' }).click(); await p.waitForTimeout(6000)
  await p.locator('.hs__ok').click()
}
async function watch(label) {
  const tl = []; const t0 = Date.now()
  while (Date.now() - t0 < 90000) { const v = await read(); tl.push([Math.round((Date.now() - t0) / 100) / 10, ...(v ?? [null, null, false])]); if (v && v[2]) break; await p.waitForTimeout(500) }
  const zs = tl.map((r) => r[1]).filter((z) => z !== null), ps = tl.map((r) => r[2]).filter((x) => x !== null)
  const marks = await p.evaluate(() => ['mogumo:intro-finish', 'mogumo:guide-open'].map((n) => { const e = performance.getEntriesByName(n); return e.length ? e[e.length - 1].startTime : null })).catch(() => [null, null])
  console.log(label, JSON.stringify({ zoomMin: Math.min(...zs), zoomMax: Math.max(...zs), pitchMin: Math.min(...ps), 降りる演出: Math.max(...zs) - Math.min(...zs) > 1.5 && Math.min(...ps) < 20, 案内: tl.some((r) => r[3]), '降り終わり→案内ms': marks[0] !== null && marks[1] !== null ? +(marks[1] - marks[0]).toFixed(1) : null }))
}
await p.goto(BASE + '/?debug', { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(4000)
const sp = p.locator('button.splash'); if (await sp.count()) { await sp.click(); await p.waitForTimeout(2500) }
await setup(); await watch('1 回目（新しいゲスト）:')
await p.getByRole('button', { name: 'スキップ' }).first().click().catch(() => {}); await p.waitForTimeout(3000)
for (const name of ['受け取る', 'もらう', 'OK', 'とじる', '閉じる']) { const b = p.getByRole('button', { name, exact: true }).first(); if (await b.count()) { await b.click().catch(() => {}); await p.waitForTimeout(1200) } }
// 設定からログアウト
await p.getByRole('button', { name: 'メニュー' }).click(); await p.waitForTimeout(1200); await p.getByRole('button', { name: '設定', exact: true }).click(); await p.waitForTimeout(2500)
await p.getByRole('button', { name: /ログアウト/ }).first().click(); await p.waitForTimeout(1200)
await p.getByRole('button', { name: 'ログアウトする' }).click(); await p.waitForTimeout(5000)
console.log('ログアウトのあと:', p.url())
await setup(); await watch('2 回目（ログアウトしてゲストで入り直し）:')
await ctx.close()
