import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { chainLikeByCount, isChainName, normalizeShopName } from './chain.ts'
import { CHAIN_NAMES } from './chainNames.ts'

describe('normalizeShopName', () => {
  it('NFKC・小文字・空白と記号を除く（・ー は残す）', () => {
    expect(normalizeShopName('ＫＦＣ　渋谷店')).toBe('kfc渋谷店')
    expect(normalizeShopName('Cafe & Bar (本店)')).toBe('cafebar本店')
    expect(normalizeShopName('マクドナルド・ラーメン')).toBe('マクドナルド・ラーメン')
    expect(normalizeShopName('ラーメン')).toBe('ラーメン')
  })
})

describe('isChainName（小さな一覧で）', () => {
  const list = ['ラーメン山岡家', '松屋', 'ガスト']
  it('一覧の名前を含めばチェーン', () => {
    expect(isChainName('ラーメン山岡家 中野店', list)).toBe(true)
    expect(isChainName('ガスト 新宿店', list)).toBe(true)
  })
  it('3文字以下の名前は、名前だけ・最初の語・名前＋〇〇店のときだけ', () => {
    expect(isChainName('松屋', list)).toBe(true)
    expect(isChainName('松屋 渋谷店', list)).toBe(true)
    expect(isChainName('松屋渋谷店', list)).toBe(true)
    expect(isChainName('まつや食堂', list)).toBe(false)
    expect(isChainName('老舗松屋食堂', list)).toBe(false)
    expect(isChainName('松屋食堂', list)).toBe(false)
  })
  it('空の名前・一覧に無い名前は違う', () => {
    expect(isChainName('', list)).toBe(false)
    expect(isChainName('麺屋もぐも', list)).toBe(false)
  })
})

describe('isChainName（本物の一覧で）', () => {
  it.each(['ラーメン山岡家 中野店', 'すき家 新宿店', 'スターバックス コーヒー 渋谷店', 'サイゼリヤ 池袋店', '松屋 高田馬場店'])('%s は当たる', (n) => {
    expect(isChainName(n)).toBe(true)
  })
  it.each(['かつや 中野店', 'かつや中野店', 'ガスト', 'hub 渋谷店', 'さと 豊中店'])('短い名前でも、名前だけ・名前＋〇〇店なら当たる: %s', (n) => {
    expect(isChainName(n)).toBe(true)
  })
  it.each(['とんかつやまだ', 'ガストロパブ 炎', 'さとう食堂', '松屋食堂', 'てんやわんや', 'カフェ hubble'])('短い名前を途中や頭に含むだけの個人店は当たらない: %s', (n) => {
    expect(isChainName(n)).toBe(false)
  })
  it.each(['まつや食堂', 'すきや食堂', '老舗松屋', '麺屋もぐも', '洋食 さくら亭', 'ビストロ田中'])('%s は当たらない', (n) => {
    expect(isChainName(n)).toBe(false)
  })
  it('一覧は正規化済みで重複なし・並び済み', () => {
    expect(CHAIN_NAMES.every((n) => n === normalizeShopName(n))).toBe(true)
    expect(new Set(CHAIN_NAMES).size).toBe(CHAIN_NAMES.length)
    expect([...CHAIN_NAMES].sort()).toEqual([...CHAIN_NAMES])
  })
})

describe('chainLikeByCount', () => {
  it('同じ正規化名が3軒以上の名前だけ', () => {
    const shops = [{ name: '麺や 太郎' }, { name: '麺や太郎' }, { name: '麺や　太郎' }, { name: 'ほか' }, { name: 'ほか' }]
    expect([...chainLikeByCount(shops)]).toEqual(['麺や太郎'])
    expect(chainLikeByCount(shops, 2).size).toBe(2)
  })
  it('支店名（最後の〇〇店）は除いて数える', () => {
    const shops = [{ name: 'らーめん大将 中野店' }, { name: 'らーめん大将 新宿店' }, { name: 'らーめん大将 高円寺店' }]
    expect([...chainLikeByCount(shops)]).toEqual(['らーめん大将'])
  })
})

describe('サーバーの写し', () => {
  for (const f of ['chain.ts', 'chainNames.ts', 'chainNamesExtra.ts']) {
    it(`supabase/functions/daily-hints/${f} は src と同じ中身`, () => {
      expect(readFileSync(`supabase/functions/daily-hints/${f}`, 'utf8')).toBe(readFileSync(`src/hints/domain/${f}`, 'utf8'))
    })
  }
})
