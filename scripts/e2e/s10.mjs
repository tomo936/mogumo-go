import { open, text, shot, go, settle } from './lib.mjs'
const { ctx, p, log } = await open({ geo: { latitude: 35.6512, longitude: 139.6362 } })
await go(p, '/?fake=35.6512,139.6362&debug', 3000); console.log('settled', await settle(p))
const later = p.getByRole('button', { name: 'あとで' }); if (await later.count()) await later.click()
await shot(p, '10a-map-girl')
// 10 キャラ一覧
await p.getByRole('button', { name: /キャラを変える/ }).click(); await p.waitForTimeout(6000); await shot(p, '10b-charlist')
const cl = p.locator('[aria-label="キャラ"]')
console.log('[10 キャラ]', (await cl.innerText()).replace(/\s+/g, ' ').slice(0, 200))
console.log('  3D canvas in viewer:', await cl.locator('canvas').count())
const box = await cl.locator('canvas').first().boundingBox()
if (box) { await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await p.mouse.down(); await p.mouse.move(box.x + box.width / 2 + 120, box.y + box.height / 2, { steps: 8 }); await p.mouse.up(); await p.waitForTimeout(800); await shot(p, '10c-charlist-rotated') }
await cl.getByRole('button', { name: '男の子', exact: true }).click(); await p.waitForTimeout(2500)
console.log('  use btn:', await cl.locator('.cl__use').innerText(), await cl.locator('.cl__use').isEnabled())
await cl.locator('.cl__use').click(); await p.waitForTimeout(3000)
console.log('  after use:', (await cl.innerText()).replace(/\s+/g, ' ').slice(0, 120))
await cl.getByRole('button', { name: '戻る' }).click(); await p.waitForTimeout(8000); await shot(p, '10d-map-boy')
// ガチャは準備中
await p.getByRole('button', { name: 'メニュー' }).click(); await p.waitForTimeout(1200); await shot(p, '10e-menu')
const g = p.getByRole('button', { name: 'ガチャ', exact: true }); console.log('  ガチャ:', await g.isEnabled(), (await p.locator('.hud').innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 120))
await g.click({ force: true }).catch(() => {}); await p.waitForTimeout(2000); await shot(p, '10f-gacha'); console.log('  ガチャを押した後:', (await text(p)).slice(0, 160))
await ctx.close(); console.log(log.slice(0, 10).join('\n'))
