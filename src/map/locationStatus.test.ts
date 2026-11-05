import { expect, test } from 'vitest'
import { nextStatus } from './locationStatus.ts'
import type { LocationEvent, LocationStatus } from './locationStatus.ts'

const fix: LocationEvent = { type: 'fix' }
const fail = (failure: 'denied' | 'unavailable' | 'timeout'): LocationEvent => ({ type: 'failure', failure })

const cases: [LocationStatus, LocationEvent, LocationStatus][] = [
  ['searching', fix, 'tracking'],
  ['tracking', fail('timeout'), 'waiting'],
  ['waiting', fix, 'tracking'],
  ['tracking', fail('unavailable'), 'waiting'],
  ['searching', fail('denied'), 'denied'],
  ['tracking', fail('denied'), 'denied'],
  ['waiting', fail('denied'), 'denied'],
  ['searching', fail('timeout'), 'searching'],
  ['searching', { type: 'firstFixTimeout' }, 'notFound'],
  ['tracking', { type: 'firstFixTimeout' }, 'tracking'],
  ['notFound', { type: 'retry' }, 'searching'],
  ['denied', { type: 'retry' }, 'denied'],
]

test.each(cases)('%s に %o が来たら %s', (from, event, to) => {
  expect(nextStatus(from, event)).toBe(to)
})
