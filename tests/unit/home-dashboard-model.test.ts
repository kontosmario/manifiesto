import { describe, expect, it } from 'vitest'
import {
  classifyDashboardError,
  daysUntilPayday,
  getGreeting,
  getPaydayCycle,
  isPaydayPending,
} from '@/features/home/home-dashboard-model'

describe('classifyDashboardError', () => {
  it('returns "network" for fetch abort and TypeError', () => {
    expect(classifyDashboardError({ name: 'AbortError' })).toBe('network')
    expect(classifyDashboardError(new TypeError('Failed to fetch'))).toBe('network')
    expect(classifyDashboardError({ message: 'Network request failed' })).toBe('network')
  })

  it('returns "server" for HTTP error responses', () => {
    expect(classifyDashboardError({ status: 500 })).toBe('server')
    expect(classifyDashboardError({ status: 503 })).toBe('server')
    expect(classifyDashboardError({ code: 'PGRST301' })).toBe('server')
  })

  it('returns "unknown" for undefined or unrecognized shapes', () => {
    expect(classifyDashboardError(null)).toBe('unknown')
    expect(classifyDashboardError({})).toBe('unknown')
    expect(classifyDashboardError(new Error('something weird'))).toBe('unknown')
  })
})

describe('daysUntilPayday', () => {
  const today = new Date('2026-04-20T12:00:00Z')

  it('returns 0 when payday is today', () => {
    expect(daysUntilPayday({ paymentDay: 20 }, today)).toBe(0)
  })

  it('returns N days until next payday in same month', () => {
    expect(daysUntilPayday({ paymentDay: 25 }, today)).toBe(5)
  })

  it('wraps to next month when payday already passed', () => {
    expect(daysUntilPayday({ paymentDay: 10 }, today)).toBe(20)
  })

  it('returns null when no payday configured', () => {
    expect(daysUntilPayday({ paymentDay: null }, today)).toBeNull()
  })
})

describe('getPaydayCycle', () => {
  it('splits the cycle around the next payday', () => {
    const today = new Date('2026-04-20T12:00:00Z')
    const cycle = getPaydayCycle({ paymentDay: 25 }, today)
    expect(cycle).not.toBeNull()
    expect(cycle?.lastPayday.toISOString()).toBe('2026-03-25T00:00:00.000Z')
    expect(cycle?.nextPayday.toISOString()).toBe('2026-04-25T00:00:00.000Z')
    expect(cycle?.totalDays).toBe(31)
    expect(cycle?.daysElapsed).toBe(26)
    expect(cycle?.daysRemaining).toBe(5)
    expect(cycle?.progress).toBeCloseTo(26 / 31, 2)
  })

  it('wraps to next month when the payday has passed', () => {
    const today = new Date('2026-04-20T12:00:00Z')
    const cycle = getPaydayCycle({ paymentDay: 10 }, today)
    expect(cycle?.lastPayday.toISOString()).toBe('2026-04-10T00:00:00.000Z')
    expect(cycle?.nextPayday.toISOString()).toBe('2026-05-10T00:00:00.000Z')
    expect(cycle?.daysElapsed).toBe(10)
    expect(cycle?.daysRemaining).toBe(20)
  })

  it('reports full progress on the day of payday', () => {
    const today = new Date('2026-04-20T12:00:00Z')
    const cycle = getPaydayCycle({ paymentDay: 20 }, today)
    expect(cycle?.daysElapsed).toBe(0)
    expect(cycle?.daysRemaining).toBe(30)
    expect(cycle?.progress).toBe(0)
  })

  it('returns null when no payday is configured', () => {
    expect(getPaydayCycle({ paymentDay: null }, new Date())).toBeNull()
  })
})

describe('getGreeting', () => {
  it('maps hours to Spanish greetings', () => {
    expect(getGreeting(3)).toBe('Buenas noches')
    expect(getGreeting(8)).toBe('Buen día')
    expect(getGreeting(15)).toBe('Buenas tardes')
    expect(getGreeting(22)).toBe('Buenas noches')
  })
})

describe('isPaydayPending', () => {
  const today = new Date('2026-04-20T12:00:00Z')

  it('returns true when today is payday and last confirmation predates it', () => {
    expect(
      isPaydayPending(
        {
          paymentDay: 20,
          lastConfirmedAt: new Date('2026-03-20T12:00:00Z').toISOString(),
        },
        today,
      ),
    ).toBe(true)
  })

  it('returns false when last confirmation is today or after this payday', () => {
    expect(
      isPaydayPending(
        {
          paymentDay: 20,
          lastConfirmedAt: new Date('2026-04-20T09:00:00Z').toISOString(),
        },
        today,
      ),
    ).toBe(false)
  })

  it('returns false when payday has not been reached this cycle', () => {
    expect(
      isPaydayPending(
        {
          paymentDay: 25,
          lastConfirmedAt: null,
        },
        today,
      ),
    ).toBe(false)
  })

  it('returns false when no payday configured', () => {
    expect(
      isPaydayPending({ paymentDay: null, lastConfirmedAt: null }, today),
    ).toBe(false)
  })
})
