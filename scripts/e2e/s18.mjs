// デグレの確認（2026-11-23 オーナー「ゲストで始めたとき、空から降りる動きが無くなった」）。
// 新しいゲストで タイトル → ゲストではじめる → 初回設定 → 地図 と進み、地図に着いてからのズームと傾きの推移を記録する。
// 降りる演出があれば、ズームが 3 ほど上がり、傾きが 0 → 55 になる。E2E_BASE で今の版と前の版を比べる。
import { open, BASE } from './lib.mjs'
const lat = 35.6512, lng = 139.6362
const { ctx, p } = await open({ fresh: true, geo: { latitude: lat, longitude: lng } })
await p.goto(BASE + '/?debug', { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(4000)
const sp = p.locator('button.splash'); if (await sp.count()) { await sp.click(); await p.waitForTimeout(2500) }
await p.getByRole('button', { name: 'ゲストではじめる' }).click(); await p.waitForTimeout(6000)
console.log('ゲストのあと:', p.url())
if (p.url().includes('/setup')) {
  if (!p.url().includes('/setup/name')) { await p.goto(BASE + '/setup/name'); await p.waitForTimeout(3000) }
  await p.locator('#nickname').fill('しけんくん'); await p.getByRole('button', { name: '次へ' }).click(); await p.waitForTimeout(2500)
  await p.locator('.cs__card').nth(1).click(); await p.waitForTimeout(500); await p.getByRole('button', { name: '次へ' }).click(); await p.waitForTimeout(6000)
  await p.evaluate(() => { window.__tl = []; const t0 = performance.now(); window.__poll = setInterval(() => { const m = document.body.innerText.match(/zoom ([\d.]+) pitch ([\d.]+)/); window.__tl.push([Math.round(performance.now() - t0), m ? +m[1] : null, m ? +m[2] : null]) }, 100) }).catch(() => {})
  await p.locator('.hs__ok').click()
}
await p.waitForTimeout(3000)
// 地図の状態は ?debug の左下の表示（zoom … pitch …）から読む（前の版にも同じ表示がある）
const tl = []
const t0 = Date.now()
while (Date.now() - t0 < 90000) {
  const v = await p.evaluate(() => { const m = document.body.innerText.match(/zoom ([\d.]+) pitch ([\d.]+)/); return m ? [+m[1], +m[2], !!document.querySelector('.guide:not(.guide--standby)'), !!document.querySelector('button.splash')] : null }).catch(() => null)
  tl.push([Math.round((Date.now() - t0) / 100) / 10, v ? +v[0].toFixed(2) : null, v ? +v[1].toFixed(0) : null, v ? v[2] : false, v ? v[3] : false])
  await p.waitForTimeout(500)
}
const zs = tl.map((r) => r[1]).filter((z) => z !== null), ps = tl.map((r) => r[2]).filter((x) => x !== null)
const marks = await p.evaluate(() => ['mogumo:intro-finish', 'mogumo:guide-open'].map((n) => performance.getEntriesByName(n)[0]?.startTime ?? null)).catch(() => [null, null])
console.log('マーク（ms）:', JSON.stringify(marks), marks[0] !== null && marks[1] !== null ? '降り終わり→案内 = ' + (marks[1] - marks[0]).toFixed(1) + ' ms' : '（どちらか出ていない）')
console.log('url:', p.url())
console.log('推移（秒:ズーム/傾き）:', tl.filter((_, i) => i % 4 === 0).map((r) => `${r[0]}:${r[1]}/${r[2]}${r[3] ? 'G' : ''}${r[4] ? 'T' : ''}`).join(' '))
console.log(JSON.stringify({ base: BASE, zoomMin: Math.min(...zs), zoomMax: Math.max(...zs), pitchMin: Math.min(...ps), pitchMax: Math.max(...ps), 降りる演出: Math.max(...zs) - Math.min(...zs) > 1.5 && Math.min(...ps) < 20, 案内が出た秒: tl.find((r) => r[3])?.[0] ?? null, 降り終わった秒: (() => { const zEnd = Math.max(...zs); return tl.find((r, i) => i > 0 && r[1] === zEnd && r[2] >= 54 && tl.slice(0, i).some((q) => q[2] !== null && q[2] < 20))?.[0] ?? null })() }))
await ctx.close()
