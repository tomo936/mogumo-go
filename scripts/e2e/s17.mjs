// 模型を読めているかの確認（2026-11-23 meshopt で縮めた後）: 地図を開いて、コンソールのエラーと画面を残す
import { open, go, settle, shot } from './lib.mjs'
const lat = 35.6512, lng = 139.6362
const { ctx, p, log } = await open({ geo: { latitude: lat, longitude: lng } })
const glb = []
p.on('response', (r) => { if (r.url().includes('.glb')) glb.push(`${r.status()} ${r.url().split('/').pop().split('?')[0]}`) })
await go(p, `/?fake=${lat},${lng}`, 2000)
console.log('settled', await settle(p))
for (const name of ['スキップ', 'あとで']) { const b = p.getByRole('button', { name }).first(); if (await b.count()) await b.click().catch(() => {}) }
await p.waitForTimeout(8000)
await shot(p, '17-meshopt')
console.log('glb:', glb.length, glb.filter((g) => !g.startsWith('200') && !g.startsWith('304')).join(' ') || 'すべて 200/304')
console.log('errors:', log.length ? log.join('\n') : 'なし')
await ctx.close()
