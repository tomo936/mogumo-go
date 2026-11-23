// 軽量化の測定（2026-11-23）: JS がどの処理で CPU を使っているか（発熱・電池の元）。CDP の Profiler で 15 秒記録し、
// 処理（関数＋ファイル）ごとの自分の時間の上位を出す。MODE=still（立ち止まり）/ walk（?fake の歩いたふり）
import { open, go, settle } from './lib.mjs'
const lat = 35.6512, lng = 139.6362
const mode = process.env.MODE ?? 'still'
const { ctx, p } = await open({ geo: { latitude: lat, longitude: lng } })
await p.setViewportSize({ width: 160, height: 340 }) // GPU の無いブラウザでは描く量を減らして、JS の割合を見やすくする
await go(p, mode === "walk" ? `/?fake=${lat},${lng}&debug` : `/?debug`, 2000) // still はブラウザの位置情報（動かない）。walk は 1 秒に 1.4m 歩くふり
console.log('settled', await settle(p))
for (const name of ['スキップ', 'あとで']) { const b = p.getByRole('button', { name }).first(); if (await b.count()) await b.click().catch(() => {}) }
await p.waitForTimeout(5000)
const cdp = await ctx.newCDPSession(p)
await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 1000 })
await cdp.send('Profiler.start'); await p.waitForTimeout(15000)
const { profile } = await cdp.send('Profiler.stop')
const dt = profile.timeDeltas, byId = new Map(profile.nodes.map((n) => [n.id, n])), self = new Map()
profile.samples.forEach((id, i) => self.set(id, (self.get(id) ?? 0) + (dt[i] ?? 0)))
const agg = new Map(); let total = 0, idle = 0
for (const [id, us] of self) {
  const cf = byId.get(id).callFrame; const name = cf.functionName || '(anonymous)'
  if (name === '(idle)' || name === '(program)' || name === '(garbage collector)') { if (name === '(idle)') idle += us; else agg.set(name, (agg.get(name) ?? 0) + us); if (name !== '(idle)') total += us; continue }
  const file = (cf.url || '').replace(/^.*\/(node_modules\/[^/]+|src\/.*?)(\?.*)?$/, '$1').replace(/\.vite\/deps\//, '')
  const key = `${name}  ${file}:${cf.lineNumber + 1}`
  agg.set(key, (agg.get(key) ?? 0) + us); total += us
}
const wall = profile.endTime - profile.startTime
console.log(JSON.stringify({ mode, wallMs: Math.round(wall / 1000), busyMs: Math.round(total / 1000), idleMs: Math.round(idle / 1000), busyPct: +(100 * total / wall).toFixed(1) }))
// ファイル（部品）ごとの合計
const byFile = new Map()
for (const [k, us] of agg) { const f = k.includes('  ') ? k.split('  ')[1].replace(/:\d+$/, '') : k; byFile.set(f, (byFile.get(f) ?? 0) + us) }
console.log('部品ごと（上位12）:'); [...byFile].sort((a, b) => b[1] - a[1]).slice(0, 12).forEach(([f, us]) => console.log(`  ${(us / 1000).toFixed(0).padStart(6)} ms  ${(100 * us / total).toFixed(1).padStart(5)}%  ${f}`))
console.log('処理ごと（上位15）:'); [...agg].sort((a, b) => b[1] - a[1]).slice(0, 15).forEach(([k, us]) => console.log(`  ${(us / 1000).toFixed(0).padStart(6)} ms  ${(100 * us / total).toFixed(1).padStart(5)}%  ${k}`))
await ctx.close()
// 呼んだ元（WHO=関数名 のとき、その関数を呼んだ 4 段上までの道筋ごとの時間）
if (process.env.WHO) {
  const parent = new Map(); for (const n of profile.nodes) for (const c of n.children ?? []) parent.set(c, n.id)
  const paths = new Map()
  for (const [id, us] of self) {
    if (byId.get(id).callFrame.functionName !== process.env.WHO) continue
    const chain = []; let cur = parent.get(id)
    for (let k = 0; k < 6 && cur; k++) { const cf = byId.get(cur).callFrame; chain.push(`${cf.functionName || '(anon)'}@${(cf.url || '').replace(/^.*\/(src\/|node_modules\/)/, '$1').replace(/\?.*$/, '')}:${cf.lineNumber + 1}`); cur = parent.get(cur) }
    const key = chain.join(' <- '); paths.set(key, (paths.get(key) ?? 0) + us)
  }
  console.log('呼んだ元:'); for (const [k, us] of [...paths].sort((a, b) => b[1] - a[1]).slice(0, 6)) console.log(`  ${Math.round(us / 1000)}ms  ${k}`)
}
