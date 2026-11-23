// 地図のカメラを倍率 16・17・18・19 で撮り、1 秒あたりの描き直しの回数と読んだタイルの数を測る（2026-11-24。OUT_NAME）
import { open, go, shot, settle } from './lib.mjs'
const P = process.env.OUT_NAME ?? 'x'
const { p } = await open({})
const W = (ms) => p.waitForTimeout(ms)
await go(p, '/?fake=35.6512,139.6362&day&debug', 30000)
await settle(p).catch(() => {})
for (let i = 0; i < 3; i++) for (const n of ['とじる', 'あとで', 'スキップ']) { const b = p.getByRole('button', { name: n, exact: true }).first(); if (await b.isVisible().catch(() => false)) { await b.click().catch(() => {}); await W(1200) } }
const box = p.locator('[aria-label="ポコタンの案内"]')
for (let i = 0; i < 30 && await box.count(); i++) { await box.click({ position: { x: 300, y: 50 } }).catch(() => {}); await W(600) }
for (const z of [16, 17, 18, 19]) {
  await p.evaluate((z) => window.__mogumoMap?.jumpTo({ zoom: z }), z); await W(6000)
  const r = await p.evaluate(() => {
    const m = window.__mogumoMap; let n = 0; const t0 = performance.now()
    return new Promise((res) => { const on = () => n++; m.on('render', on); setTimeout(() => { m.off('render', on); res({ pitch: Math.round(m.getPitch()), rps: Math.round(n / ((performance.now() - t0) / 1000)), tiles: Object.keys(m.style?.sourceCaches ?? {}).reduce((s, k) => s + (m.style.sourceCaches[k].getIds?.().length ?? 0), 0) }) }, 4000) })
  })
  console.log('zoom', z, JSON.stringify(r)); await shot(p, `${P}-cam-z${z}`)
}
console.log('done'); process.exit(0)
