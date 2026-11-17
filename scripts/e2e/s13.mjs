import { open, text, shot, go, settle, BASE } from './lib.mjs'
const { ctx, p, log } = await open({ geo: { latitude: 35.6512, longitude: 139.6362 } })
// コルティへ（歩いたふり）
await ctx.setGeolocation({ latitude: 35.6512, longitude: 139.6362 })
await go(p, '/?fake=35.6512,139.6362&debug', 3000); console.log('settled', await settle(p))
const menu = async (name) => { await p.getByRole('button', { name: 'メニュー' }).click(); await p.waitForTimeout(1200); await p.getByRole('button', { name, exact: true }).click() }
// チェックインして、感想（ゲストは不可）
await p.getByRole('button', { name: '近くのお店' }).click(); await p.waitForTimeout(2000)
await p.getByText('叙々苑').first().click(); await p.waitForTimeout(2000)
const rv = p.getByRole('button', { name: /感想/ }); console.log('[感想] buttons', await rv.count())
await rv.first().click(); await p.waitForTimeout(2000); await shot(p, '13a-guest-review')
console.log('  押したあと:', (await text(p)).replace(/dpr 2.*?projectAt ok \/ /, '').slice(0, 160))
await p.locator('.lp').getByRole('button', { name: 'やめる' }).click().catch((e) => console.log('  close?', String(e).slice(0, 60))); await p.waitForTimeout(1000)
// サーバー側でもゲストの感想を断るか（RLS）
const rls = await p.evaluate(async (CK) => {
  const k = Object.keys(localStorage).find((x) => x.startsWith('sb-') && x.endsWith('-auth-token')); const s = JSON.parse(localStorage.getItem(k))
  const r = await fetch('http://127.0.0.1:54321/rest/v1/reviews', { method: 'POST', headers: { apikey: s.access_token, Authorization: 'Bearer ' + s.access_token, 'Content-Type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify({ user_id: s.user.id, shop_id: 'osm:120197635761', checkin_id: CK, stars: 5, body: 'test' }) })
  return r.status + ' ' + (await r.text()).slice(0, 140)
}, process.env.CK)
console.log('  RLS で直接書く:', rls)
await p.locator('.shop-sheet__close, [aria-label="閉じる"]').first().click().catch(() => {}); await p.waitForTimeout(1500)
// マイページ: ニックネームを変える
await menu('マイページ'); await p.waitForTimeout(2500); await shot(p, '13b-mypage')
const mp = p.locator('[aria-label="マイページ"]'); console.log('[マイページ]', (await mp.innerText()).replace(/\s+/g, ' ').slice(0, 160))
await mp.getByRole('button', { name: 'ニックネームを変える' }).click(); await mp.getByRole('textbox', { name: 'ニックネーム' }).fill('しけん3'); await mp.getByRole('button', { name: '保存' }).click(); await p.waitForTimeout(2500)
console.log('  変えたあと:', (await mp.innerText()).replace(/\s+/g, ' ').slice(0, 80))
await mp.getByRole('button', { name: '戻る' }).click(); await p.waitForTimeout(1500)
// 図鑑の「？」カード
await menu('図鑑'); await p.waitForTimeout(5000)
const z = p.locator('[aria-label="図鑑"]'); await z.locator('[aria-label="まだ行っていないお店のヒント"]').first().click(); await p.waitForTimeout(1500); await shot(p, '13c-zukan-hint')
console.log('[図鑑の？]', (await z.innerText()).replace(/\s+/g, ' ').match(/.{0,10}(へ|約).{0,40}/)?.[0])
await z.getByRole('button', { name: '閉じる' }).first().click(); await p.waitForTimeout(1500)
// 記録の「町」
await menu('記録'); await p.waitForTimeout(5000); const r = p.locator('[aria-label="記録"]')
await r.getByRole('button', { name: '町の範囲を出す' }).click(); await p.waitForTimeout(4000); await shot(p, '13d-record-towns')
console.log('[記録の町]', (await r.innerText()).replace(/\s+/g, ' ').match(/町のクリア.{0,80}/)?.[0])
await r.getByRole('button', { name: '戻る' }).click(); await p.waitForTimeout(1500)
// ログアウト（ゲストは警告）
await menu('設定'); await p.waitForTimeout(2500)
await p.locator('[aria-label="設定"]').getByRole('button', { name: 'ログアウト' }).click(); await p.waitForTimeout(1500); await shot(p, '13e-guest-logout')
console.log('[ログアウト]', (await text(p)).match(/ゲストのまま.{0,120}/)?.[0])
await ctx.close(); console.log(log.slice(0, 10).join('\n'))
