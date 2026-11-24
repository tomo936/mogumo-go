// 描画距離の効き目を測る（2026-11-24）。URL ごとに、倍率 17・18・19 で 1 コマの頂点の数と画面を撮る
// 主人公は止めておく（?fake なし）。頂点は WebGL の描画命令を数える
import { open, go, shot } from './lib.mjs'
const P = process.env.OUT_NAME ?? 'x'
const urls = (process.env.URLS ?? '/?day&debug|/?day&debug&pad=0.34&draw=100000|/?day&debug&pad=0.34').split('|')
const { p } = await open({})
await p.addInitScript(() => {
  const w = window; w.__gl = { calls: 0, verts: 0 }
  for (const C of [window.WebGL2RenderingContext, window.WebGLRenderingContext]) {
    if (!C) continue
    const Pr = C.prototype
    const wrap = (name, cnt) => { const o = Pr[name]; if (!o) return; Pr[name] = function (...a) { w.__gl.calls++; w.__gl.verts += cnt(a); return o.apply(this, a) } }
    wrap('drawElements', (a) => a[1]); wrap('drawArrays', (a) => a[2]); wrap('drawElementsInstanced', (a) => a[1] * a[4]); wrap('drawArraysInstanced', (a) => a[2] * a[3])
  }
})
for (const [ui, url] of urls.entries()) {
  await go(p, url, 30000)
  await p.waitForFunction(() => window.__mogumoMap && window.__mogumoMap.getMinZoom() >= 16, null, { timeout: 90000 }).catch(() => {})
  for (const n of ['とじる', 'あとで', 'スキップ']) { const b = p.getByRole('button', { name: n, exact: true }).first(); if (await b.isVisible().catch(() => false)) await b.click().catch(() => {}) }
  for (const z of [17, 18, 19]) {
    const r = await p.evaluate(async (z) => {
      const m = window.__mogumoMap; m.jumpTo({ zoom: z }); await new Promise((r) => setTimeout(r, 5000))
      const vs = []
      for (let k = 0; k < 3; k++) { window.__gl.verts = 0; let f = 0; const on = () => f++; m.on('render', on); for (let i = 0; i < 8; i++) { m.triggerRepaint(); await new Promise((r) => requestAnimationFrame(r)) } await new Promise((r) => setTimeout(r, 200)); m.off('render', on); vs.push(Math.round(window.__gl.verts / f / 1000)) }
      return { zoom: z, pitch: Math.round(m.getPitch()), kVerts: vs }
    }, z)
    console.log(url, JSON.stringify(r)); await shot(p, `${P}-${ui}-z${z}`)
  }
}
console.log('done'); process.exit(0)
