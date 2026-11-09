import { describe, expect, it } from 'vitest'
import { dragHeight, sheetStop } from './sheetDrag.ts'

describe('sheetStop', () => {
  it('上に引いたら全画面', () => {
    expect(sheetStop('small', -60, 400, 260)).toBe('full')
    expect(sheetStop('full', -60, 800, 260)).toBe('full')
  })
  it('小さい段で下に引いたら閉じる', () => {
    expect(sheetStop('small', 60, 200, 260)).toBe('close')
  })
  it('全画面で下に引いたら小さく、一気に下まで引いたら閉じる', () => {
    expect(sheetStop('full', 300, 500, 260)).toBe('small')
    expect(sheetStop('full', 700, 100, 260)).toBe('close')
  })
  it('少しだけなら元の段', () => {
    expect(sheetStop('small', -20, 280, 260)).toBe('small')
    expect(sheetStop('full', 20, 780, 260)).toBe('full')
  })
})

describe('dragHeight', () => {
  it('指についてくる。0〜画面の高さに収める', () => {
    expect(dragHeight(260, -100, 800)).toBe(360)
    expect(dragHeight(260, 400, 800)).toBe(0)
    expect(dragHeight(700, -300, 800)).toBe(800)
  })
})
