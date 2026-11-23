// タイトルをタップしてから、空から降りる演出が終わるまでと、ポコタンの案内が出るまでの時刻を測る
// （2026-11-23 オーナー「グイーンの後に 0.000001 秒も間なくポコタンが出るべき」）。
// 初めての人 = 案内を見ていない人。準備: 新しいゲストで初回設定まで済ませ、案内の「見た」の印を消してから開き直す。
import { open, shot, go, settle } from './lib.mjs'
const lat = 35.6512, lng = 139.6362
const { ctx, p } = await open({ fresh: true, geo: { latitude: lat, longitude: lng } })
await go(p, '/', 3000)
await p.getByRole('button', { name: 'ゲストではじめる' }).click(); await p.waitForTimeout(5000)
await go(p, '/setup/name')
await p.locator('#nickname').fill('しけんくん'); await p.getByRole('button', { name: '次へ' }).click(); await p.waitForTimeout(2500)
await p.locator('.cs__card').nth(1).click(); await p.waitForTimeout(500); await p.getByRole('button', { name: '次へ' }).click(); await p.waitForTimeout(6000)
await p.locator('.hs__ok').click(); await p.waitForTimeout(8000)
await p.evaluate(() => { for (const k of Object.keys(localStorage)) if (k.startsWith('mogumo.tutorial')) localStorage.removeItem(k) })
await p.goto('http://127.0.0.1:5174/?fake=' + lat + ',' + lng + '&debug', { waitUntil: 'domcontentloaded' })
const splash = p.locator('button.splash')
await splash.waitFor({ timeout: 60000 })
// ローディングが終わってタップできるまで待つ
for (let i = 0; i < 120; i++) { if (await splash.isEnabled().catch(() => false) && !(await splash.innerText()).includes('読み込み中')) break; await p.waitForTimeout(500) }
await p.evaluate(() => {
  window.__tl = []; const t0 = performance.now()
  const guide = () => !!document.querySelector('.guide:not(.guide--standby)') // 見えている案内だけ（控えは数えない）
  const zoom = () => Number((document.body.innerText.match(/zoom ([\d.]+)/) || [])[1] || 0)
  window.__t0 = t0
  window.__poll = setInterval(() => window.__tl.push({ t: Math.round(performance.now() - t0), guide: guide(), zoom: zoom(), sky: !!document.querySelector('[data-testid="sky-intro"]'), splash: !!document.querySelector('button.splash'), locked: !!document.getElementById('root')?.inert, standby: !!document.querySelector('.guide--standby'), poko: document.querySelector('.guide__debug')?.textContent || '', still: !!document.querySelector('.guide__poko img') }), 50)
})
await splash.click()
// 降りている途中で、メニューのボタンと地図を押してみる（何も起きないのが正しい）
await p.waitForTimeout(4000)
const midLocked = await p.evaluate(() => !!document.getElementById('root')?.inert)
await p.mouse.click(195, 760).catch(() => {}); await p.mouse.click(200, 500).catch(() => {})
await p.waitForTimeout(800)
const menuOpened = await p.locator('.hud-fan, [aria-label="メニュー"][aria-expanded="true"]').count()
const sheetOpened = await p.locator('.shop-sheet, [aria-label="ビルのお店"]').count()
console.log('降りている途中: ロック', midLocked, '／押してメニューが開いた', menuOpened, '／お店が開いた', sheetOpened)
for (let i = 0; i < 240; i++) { if ((await p.evaluate(() => performance.getEntriesByName('mogumo:guide-open').length)) > 0) break; await p.waitForTimeout(500) }
await p.waitForTimeout(1500)
const unlockAt = await p.evaluate(() => { const r = window.__tl.find((x) => x.guide); const sb = window.__tl.find((x) => x.standby); return r ? { guideSeenAt: r.t, lockedThen: r.locked, pokoAtReveal: r.poko, stillAtReveal: r.still, standbyFrom: sb?.t ?? null } : null })
console.log('案内が見えた最初の記録:', JSON.stringify(unlockAt))
const marks = await p.evaluate(() => ['mogumo:intro-finish', 'mogumo:guide-open'].map((n) => [n, performance.getEntriesByName(n)[0]?.startTime ?? null]))
console.log('マーク（ms）:', JSON.stringify(marks), marks[0][1] !== null && marks[1][1] !== null ? '降り終わり→案内 = ' + (marks[1][1] - marks[0][1]).toFixed(1) + ' ms' : '（どちらか出ていない）')
const tl = await p.evaluate(() => { clearInterval(window.__poll); return window.__tl })
const first = (f) => tl.find(f)?.t
const guideAt = first((r) => r.guide)
// 降り終わり = ズームが最後の値に落ち着いた最初の時刻（それ以降は 1 秒間動かない）
let settled = null
for (let i = 0; i < tl.length; i++) { const z = tl[i].zoom; if (z && tl.slice(i, i + 20).every((r) => Math.abs(r.zoom - z) < 0.02)) { settled = tl[i].t; break } }
console.log(JSON.stringify({ guideAt, zoomSettledAt: settled, titleGoneAt: first((r) => !r.splash && !r.sky) }))
console.log('推移（250ms ごと。G=案内 L=ロック s=タイトルの絵）:', tl.filter((_, i) => i % 5 === 0).map((r) => `${r.t}:${r.zoom}${r.guide ? 'G' : ''}${r.locked ? 'L' : ''}${r.sky ? 's' : ''}`).join(' '))
const unlockedBeforeGuide = tl.filter((r) => r.zoom && !r.splash && !r.sky && !r.locked && !r.guide)
console.log('地図が見えていて、ロックも案内も無い記録（0 件が正しい）:', unlockedBeforeGuide.length, unlockedBeforeGuide.slice(0, 3).map((r) => r.t).join(','))
await shot(p, '15-guide'); await ctx.close()
