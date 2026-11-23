// タップした建物と開く店の一致（2026-11-23 オーナー「タップした建物と違う建物に飛ぶ」）。
// 画面の格子点を順にタップし、点を赤く描いた画面と開いた店の名前を残す。目で「点の下の建物 = 開いた店」を確かめる。
import { open, shot, go, settle } from './lib.mjs'
// 使い方: node s14.mjs [緯度 経度]（既定は経堂。新宿駅は 35.6896 139.7006）
const lat = Number(process.argv[2] ?? 35.6512), lng = Number(process.argv[3] ?? 139.6362)
const { ctx, p } = await open({ fresh: true, geo: { latitude: lat, longitude: lng } })
await go(p, '/', 3000)
await p.getByRole('button', { name: 'ゲストではじめる' }).click(); await p.waitForTimeout(5000)
await go(p, '/setup/name')
await p.locator('#nickname').fill('しけんくん'); await p.getByRole('button', { name: '次へ' }).click(); await p.waitForTimeout(2500)
await p.locator('.cs__card').nth(1).click(); await p.waitForTimeout(500); await p.getByRole('button', { name: '次へ' }).click(); await p.waitForTimeout(6000)
await p.locator('.hs__ok').click(); await p.waitForTimeout(8000)
await go(p, `/?fake=${lat},${lng}&debug`, 2000); console.log('settled in', await settle(p), 's')
const later = p.getByRole('button', { name: 'あとで' }); if (await later.count()) await later.click()
// 初めての人に出るポコタンの案内（地図に入って 3.2 秒後）とログインボーナスを閉じる
await p.waitForTimeout(5000)
for (let i = 0; i < 4; i++) { const sk = p.getByRole('button', { name: 'スキップ' }); if (await sk.count()) { await sk.first().click().catch(() => {}); await p.waitForTimeout(1500) } }
for (const name of [/受け取る|もらう|OK|とじる|閉じる/]) { const b = p.getByRole('button', { name }).first(); if (await b.count()) { await b.click().catch(() => {}); await p.waitForTimeout(1500) } }
await shot(p, `14-${lat > 35.66 ? 'shinjuku' : 'kyodo'}-start`)
const pts = []
// 環境変数 PTS="x,y;x,y" で点を選べる（無ければ 4×5 の格子）
if (process.env.PTS) for (const q of process.env.PTS.split(';')) pts.push(q.split(',').map(Number))
else for (const y of [330, 420, 500, 580, 650]) for (const x of [70, 150, 230, 310]) pts.push([x, y])
let n = 0
for (const [x, y] of pts) {
  await p.evaluate(([x, y]) => { document.getElementById('dot')?.remove(); const d = document.createElement('div'); d.id = 'dot'; d.style.cssText = `position:fixed;left:${x - 6}px;top:${y - 6}px;width:12px;height:12px;border-radius:6px;background:red;border:2px solid #fff;z-index:99999;pointer-events:none`; document.body.appendChild(d) }, [x, y])
  await p.waitForTimeout(600); await shot(p, `14-${lat > 35.66 ? 'shinjuku' : 'kyodo'}-${String(n).padStart(2, '0')}a-before`) // タップ前（点の下の建物を見るため）
  await p.mouse.click(x, y); await p.waitForTimeout(1200)
  const title = await p.locator('.shop-sheet h2, .building-sheet h2, [aria-label="ビルのお店"] h2').first().innerText().catch(() => '(なし)')
  console.log(n, x, y, title.replace(/\s+/g, ' '))
  await shot(p, `14-${lat > 35.66 ? 'shinjuku' : 'kyodo'}-${String(n).padStart(2, '0')}`)
  const close = p.getByRole('button', { name: /閉じる|×/ }).first(); if (await close.count()) await close.click().catch(() => {})
  await p.waitForTimeout(500); n++
}
await ctx.close()
