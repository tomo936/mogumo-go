import { expect, test } from 'vitest'
import { loadCoins } from './coins.ts'

const client = (rows: unknown[] | null, error: unknown = null) => ({
  from: () => ({
    select: () => {
      const q = { order: () => q, range: (a: number, b: number) => Promise.resolve({ data: rows ? rows.slice(a, b + 1) : null, error }) }
      return q
    },
  }),
})

test('amount を合計する（1000 行をこえてもページを分けて全部読む）', async () => {
  const rows = [...Array.from({ length: 1000 }, () => ({ amount: 30 })), { amount: 10 }, { amount: -100 }]
  expect(await loadCoins(client(rows))).toBe(30_000 + 10 - 100)
})

test('読めなければ throw', async () => {
  await expect(loadCoins(client(null, { message: 'x' }))).rejects.toThrow()
})
