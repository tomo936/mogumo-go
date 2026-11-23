// まとめピンの絵（cl-<数>）が何回・どの数で描かれるかを数える（2026-11-24 軽量化の調査）
import { open, go, settle } from './lib.mjs'
const { p } = await open({ geo: { latitude: 35.6512, longitude: 139.6362 } })
await p.addInitScript(() => {
  const w = window; w.__gid = []; const orig = CanvasRenderingContext2D.prototype.getImageData
  CanvasRenderingContext2D.prototype.getImageData = function (...a) { const t = performance.now(); const r = orig.apply(this, a); w.__gid.push([Math.round(t), a[2] + 'x' + a[3], Math.round(performance.now() - t)]); return r }
})
await go(p, '/?debug', 2000); console.log('settled', await settle(p))
for (const name of ['スキップ', 'あとで', 'とじる']) { const b = p.getByRole('button', { name }).first(); if (await b.count()) await b.click().catch(() => {}) }
await p.waitForTimeout(5000)
const before = await p.evaluate(() => window.__gid.length)
const imgs0 = await p.evaluate(() => window.__mogumoMap?.listImages().filter((i) => i.startsWith('cl-')).length)
await p.waitForTimeout(15000)
const r = await p.evaluate(() => window.__gid)
const last = r.slice(before)
console.log(JSON.stringify({ allMs: r.reduce((s, x) => s + x[2], 0), firstAt: r[0]?.[0], lastAt: r.at(-1)?.[0], total: r.length, in15s: last.length, sumMs: last.reduce((s, x) => s + x[2], 0), sizes: [...new Set(last.map((x) => x[1]))], sample: last.slice(0, 5), clImagesAtStart: imgs0, clImagesNow: await p.evaluate(() => window.__mogumoMap?.listImages().filter((i) => i.startsWith('cl-')).length) }))
process.exit(0)
