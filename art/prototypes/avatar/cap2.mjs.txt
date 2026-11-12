// 使い方: node cap2.mjs <url> <出力フォルダ>。ページが window.save(name, dataURL) で1枚ずつ渡す
import { chromium } from '/home/otosa/tools/pw/node_modules/playwright/index.mjs'
import fs from 'fs'
const [url, dir] = process.argv.slice(2)
fs.mkdirSync(dir, { recursive: true })
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
const p = await b.newPage({ viewport: { width: 800, height: 600 } })
p.on('pageerror', (e) => console.log('[pageerror]', e.message))
p.on('console', (m) => console.log('[console]', m.text()))
await p.exposeFunction('save', (k, v) => fs.writeFileSync(`${dir}/${k}.png`, Buffer.from(v.split(',')[1], 'base64')))
await p.goto(url)
await p.waitForSelector('body[data-ready]', { state: 'attached', timeout: 600000 })
await b.close()
