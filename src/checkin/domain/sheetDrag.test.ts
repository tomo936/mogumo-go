import { describe, expect, it } from 'vitest'
import { dragHeight, sheetStop } from './sheetDrag.ts'

describe('sheetStop', () => {
  it('上に引いたら全画面', () => {
    expect(sheetStop('small', -60)).toBe('full')
    expect(sheetStop('full', -60)).toBe('full')
  })
  it('下に引いても閉じない（小さい段のまま／全画面なら小さい段へ）', () => {
    expect(sheetStop('small', 200)).toBe('small')
    expect(sheetStop('full', 300)).toBe('small')
    expect(sheetStop('full', 900)).toBe('small')
  })
  it('少しだけなら元の段', () => {
    expect(sheetStop('small', -20)).toBe('small')
    expect(sheetStop('full', 20)).toBe('full')
  })
})

describe('dragHeight', () => {
  it('指についてくる。小さい段〜画面の高さに収める', () => {
    expect(dragHeight(260, -100, 260, 800)).toBe(360)
    expect(dragHeight(260, 400, 260, 800)).toBe(260) // 小さい段で下へ引いても動かない
    expect(dragHeight(700, 900, 260, 800)).toBe(260)
    expect(dragHeight(700, -300, 260, 800)).toBe(800)
  })
})
