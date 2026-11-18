import { describe, expect, it } from 'vitest'
import { GUIDE_PAGES, guideKey, holeAround, mouthAt, onTap, shownChars, unionRect } from './guide.ts'

describe('ポコタンの案内の決まり', () => {
  it('9 ページで、最初はナビゲーターのあいさつ、どの文も「ポコ」で終わる', () => {
    expect(GUIDE_PAGES).toHaveLength(9)
    expect(GUIDE_PAGES[0].text.startsWith('ナビゲーターのポコタンポコ！')).toBe(true)
    for (const p of GUIDE_PAGES) expect(p.text).toMatch(/ポコ[！〜]*$/)
    expect(GUIDE_PAGES.map((p) => p.target)).toEqual(['none', 'none', 'none', 'none', 'none', 'hint', 'menu', 'player', 'none'])
  })

  it('字は 40ms に 1 字ずつ、一定の速さで出る（区切りでも止まらない）', () => {
    expect(shownChars('あいう', 0)).toBe(0)
    expect(shownChars('あ。い', 80)).toBe(2)
    expect(shownChars('あ。い', 120)).toBe(3)
    expect(shownChars('あいう', 10_000)).toBe(3)
  })

  it('口は字が出ている間だけ動き、区切りと出きったあとは閉じる', () => {
    expect(mouthAt('あいうえお', 0)).toBe(0)
    expect(mouthAt('あいうえお', 5)).toBe(0)
    expect(mouthAt('あ、いうえ', 2)).toBe(0)
    const opens = [1, 2, 3, 4].map((n) => mouthAt('あいうえおか', n))
    expect(new Set(opens).size).toBe(2) // 開いたり閉じかけたり
  })

  it('タップ: 途中なら全部出す、出きっていれば次へ、最後なら閉じる', () => {
    expect(onTap(0, false)).toBe('reveal')
    expect(onTap(0, true)).toBe('next')
    expect(onTap(GUIDE_PAGES.length - 1, true)).toBe('close')
  })

  it('見たかどうかは人ごとの鍵', () => {
    expect(guideKey('u1')).toBe('mogumo.tutorial.u1')
  })

  it('霧はチェックインで晴れる・目標は町のクリア・ガチャでキャラを変えられる、を言う', () => {
    const all = GUIDE_PAGES.map((p) => p.text).join('')
    expect(all).toContain('チェックインすると、まわりの霧がパーッと晴れる')
    expect(all).toContain('目指すのは町のクリア')
    expect(all).toContain('ガチャ')
    expect(all).not.toContain('歩くと晴れ')
  })

  it('いくつかの部品をまとめて囲む', () => {
    expect(unionRect([])).toBeNull()
    expect(unionRect([{ left: 10, top: 10, width: 50, height: 50 }, { left: 70, top: 20, width: 40, height: 20 }])).toEqual({ left: 10, top: 10, width: 100, height: 50 })
  })

  it('抜く丸は部品の真ん中に、部品より少し大きく', () => {
    expect(holeAround({ left: 100, top: 20, width: 60, height: 40 }, 12)).toEqual({ cx: 130, cy: 40, r: 42 })
  })
})
