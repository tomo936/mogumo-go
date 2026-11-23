// 軽量化の測定（2026-11-23）: 立ち止まって何もしていないときに、地図が 1 秒に何回描き直すか・JS がどれだけ忙しいか。
// 前のログイン（s14/s15 のゲスト）をそのまま使う。結果は 1 行の JSON。
import { open, go, settle } from './lib.mjs'
const lat = 35.6512, lng = 139.6362
const { ctx, p } = await open({ geo: { latitude: lat, longitude: lng } })
// GPU の無いブラウザは 1 コマが重いので、画面を小さくして描き直しの回数の違いを見えるようにする（比べるのは同じ条件どうし）
await p.setViewportSize({ width: 160, height: 340 })
const extra = process.env.IDLEFPS ? `&idlefps=${process.env.IDLEFPS}` : ''
await go(p, `/?fake=${lat},${lng}&debug${extra}`, 2000)
console.log('settled', await settle(p))
for (const name of ['スキップ', 'あとで']) { const b = p.getByRole('button', { name }).first(); if (await b.count()) await b.click().catch(() => {}) }
await p.waitForTimeout(5000)
const r = await p.evaluate(async () => {
  const m = window.__mogumoMap
  let renders = 0
  m?.on('render', () => renders++)
  let raf = 0; const loop = () => { raf++; requestAnimationFrame(loop) }; requestAnimationFrame(loop)
  let busy = 0; const po = new PerformanceObserver((l) => { for (const e of l.getEntries()) busy += e.duration }); try { po.observe({ type: 'longtask', buffered: false }) } catch {}
  const t0 = performance.now(); await new Promise((r) => setTimeout(r, 10000)); const s = (performance.now() - t0) / 1000
  return { seconds: +s.toFixed(1), mapRendersPerSec: m ? +(renders / s).toFixed(1) : 'map 無し', rafPerSec: +(raf / s).toFixed(1), longTaskMsPerSec: +(busy / s).toFixed(0) }
})
console.log(JSON.stringify({ idlefps: process.env.IDLEFPS || '30（標準）', ...r }))
await ctx.close()
