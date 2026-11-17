import { open, go } from './lib.mjs'
const { ctx, p } = await open({ geo: { latitude: 35.6512, longitude: 139.6362 } })
await go(p, '/settings-none', 3000)
const out = await p.evaluate(async (CK) => {
  const k = Object.keys(localStorage).find((x) => x.startsWith('sb-') && x.endsWith('-auth-token')); const s = JSON.parse(localStorage.getItem(k))
  const h = { apikey: s.access_token, Authorization: 'Bearer ' + s.access_token, 'Content-Type': 'application/json', Prefer: 'return=minimal' }
  const r1 = await fetch('http://127.0.0.1:54321/rest/v1/reviews', { method: 'POST', headers: h, body: JSON.stringify({ shop_id: 'osm:120197635761', checkin_id: CK, stars: 5, body: 'test' }) })
  return `is_anonymous=${s.user.is_anonymous} → ${r1.status} ${(await r1.text()).slice(0, 160)}`
}, process.env.CK)
console.log(out)
await ctx.close()
