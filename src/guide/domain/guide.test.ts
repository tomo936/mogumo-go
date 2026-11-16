import { describe, expect, it } from 'vitest'
import { GUIDE_PAGES, guideKey, holeAround, onTap, shownChars } from './guide.ts'

describe('ポコタンの案内の決まり', () => {
  it('6 ページで、最初はナビゲーターのあいさつ、どの文も「ポコ」で終わる', () => {
    expect(GUIDE_PAGES).toHaveLength(6)
    expect(GUIDE_PAGES[0].text.startsWith('ナビゲーターのポコタンポコ！')).toBe(true)
    for (const p of GUIDE_PAGES) expect(p.text).toMatch(/ポコ[！〜]*$/)
    expect(GUIDE_PAGES.map((p) => p.target)).toEqual(['none', 'me', 'me', 'hint', 'menu', 'none'])
  })

  it('字は 40ms に 1 字ずつ出て、文の長さで止まる', () => {
    expect(shownChars('あいう', 0)).toBe(0)
    expect(shownChars('あいう', 80)).toBe(2)
    expect(shownChars('あいう', 10_000)).toBe(3)
  })

  it('タップ: 途中なら全部出す、出きっていれば次へ、最後なら閉じる', () => {
    expect(onTap(0, false)).toBe('reveal')
    expect(onTap(0, true)).toBe('next')
    expect(onTap(GUIDE_PAGES.length - 1, true)).toBe('close')
  })

  it('見たかどうかは人ごとの鍵', () => {
    expect(guideKey('u1')).toBe('mogumo.tutorial.u1')
  })

  it('抜く丸は部品の真ん中に、部品より少し大きく', () => {
    expect(holeAround({ left: 100, top: 20, width: 60, height: 40 }, 12)).toEqual({ cx: 130, cy: 40, r: 42 })
  })
})
