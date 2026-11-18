// 地図に貼る HTML マーカー（ビルのピン・気配のピン）が、MapLibre の決めた absolute のままでいるか。
// relative にすると入れ物の中で文書の流れに乗り、前にある気配のピン（40px）の高さ分だけ後ろのピンが下へずれる（2026-11-09 の不具合）
// （テストでは CSS の import が空になるので、ファイルをそのまま読む）
/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { expect, test } from 'vitest'

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')
const maplibreCss = read('../../../node_modules/maplibre-gl/dist/maplibre-gl.css')
const checkinCss = read('../../checkin/ui/checkin.css')
const hintsCss = read('../../hints/ui/hints.css')

test('ビルのピンと気配のピンのマーカーは position: absolute（CSS の読み込み順によらない）', () => {
  // アプリと同じ順（maplibre → 各画面の CSS）と逆の順の両方で確かめる
  for (const order of [
    [maplibreCss, checkinCss, hintsCss],
    [checkinCss, hintsCss, maplibreCss],
  ]) {
    const styles = order.map((css) => {
      const s = document.createElement('style')
      s.textContent = css
      document.head.appendChild(s)
      return s
    })
    for (const cls of ['bldg-pins', 'hint-pin']) {
      const el = document.createElement(cls === 'hint-pin' ? 'button' : 'div')
      el.className = `${cls} maplibregl-marker`
      document.body.appendChild(el)
      expect(getComputedStyle(el).position, cls).toBe('absolute')
      el.remove()
    }
    for (const s of styles) s.remove()
  }
})
