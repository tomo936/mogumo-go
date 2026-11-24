import { expect, test } from 'vitest'
import { visitedPrefCodes } from './prefectures.ts'

test('町の番号の頭 2 桁を、重なりなしで返す', () => {
  expect(visitedPrefCodes(['13112-経堂', '13112-赤堤', '14100-x', 'bad'])).toEqual(['13', '14'])
})
