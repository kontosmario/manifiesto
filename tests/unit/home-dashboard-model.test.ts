import { describe, expect, it } from 'vitest'
import {
  classifyDashboardError,
  daysUntilPayday,
  getGreeting,
  getGreetingName,
  getPaydayCycle,
  isPaydayPending,
} from '@/features/home/home-dashboard-model'
import { getCurrentPayCycle, type PayCycle } from '@/utils/pay-cycle'

const D = (y: number, m: number, d: number) => new Date(y, m - 1, d)
const UTC = (iso: string) => new Date(iso)

function monthlyCycle(paymentDay: number, today: Date): PayCycle {
  return getCurrentPayCycle(today, {
    cycle_type: 'monthly',
    salary_payment_day: paymentDay,
  })
}

function biweeklyCycle(anchorIso: string, today: Date): PayCycle {
  return getCurrentPayCycle(today, {
    cycle_type: 'biweekly',
    cycle_anchor_date: anchorIso,
    cycle_length_days: 14,
  })
}

function weeklyCycle(anchorIso: string, today: Date): PayCycle {
  return getCurrentPayCycle(today, {
    cycle_type: 'weekly',
    cycle_anchor_date: anchorIso,
    cycle_length_days: 7,
  })
}

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
  it('returns 0 when payday is today (monthly)', () => {
    const today = D(2026, 4, 20)
    expect(daysUntilPayday(monthlyCycle(20, today), today)).toBe(30)
    // ↑ cycle.end = may 20, today = apr 20 → 30 days (cycle window length)
  })

  it('returns N days until cycle.end (monthly)', () => {
    const today = D(2026, 4, 20)
    expect(daysUntilPayday(monthlyCycle(25, today), today)).toBe(5)
  })

  it('returns null when cycle is null', () => {
    expect(daysUntilPayday(null, D(2026, 4, 20))).toBeNull()
  })

  it('biweekly: returns days until next paycheck (cycle.end)', () => {
    const today = D(2026, 6, 5)
    // anchor may 23, length 14 → cycle.end = jun 6 → 1 day until next paycheck
    expect(daysUntilPayday(biweeklyCycle('2026-05-23', today), today)).toBe(1)
  })

  it('weekly: returns days until next paycheck', () => {
    const today = D(2026, 6, 4)
    // anchor jun 1, length 7 → cycle.end = jun 8 → 4 days until next paycheck
    expect(daysUntilPayday(weeklyCycle('2026-06-01', today), today)).toBe(4)
  })
})

describe('getPaydayCycle', () => {
  it('exposes cycle start/end + elapsed/remaining for monthly', () => {
    const today = D(2026, 4, 20)
    const cycle = getPaydayCycle(monthlyCycle(25, today), today)
    expect(cycle).not.toBeNull()
    expect(cycle?.lastPayday).toEqual(D(2026, 3, 25))
    expect(cycle?.nextPayday).toEqual(D(2026, 4, 25))
    expect(cycle?.totalDays).toBe(31)
    expect(cycle?.daysElapsed).toBe(26)
    expect(cycle?.daysRemaining).toBe(5)
    expect(cycle?.progress).toBeCloseTo(26 / 31, 2)
  })

  it('biweekly: 14-day cycle, halfway through', () => {
    const today = D(2026, 5, 30)
    // anchor may 23, length 14 → cycle.start = may 23, cycle.end = jun 6
    const cycle = getPaydayCycle(biweeklyCycle('2026-05-23', today), today)
    expect(cycle?.totalDays).toBe(14)
    expect(cycle?.daysElapsed).toBe(7)
    expect(cycle?.daysRemaining).toBe(7)
    expect(cycle?.progress).toBeCloseTo(0.5, 1)
  })

  it('returns null when cycle is null', () => {
    expect(getPaydayCycle(null, new Date())).toBeNull()
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

describe('getGreetingName', () => {
  it('keeps a simple name as-is', () => {
    expect(getGreetingName('Mario')).toBe('Mario')
  })

  it('preserves compound first names (two tokens)', () => {
    expect(getGreetingName('Juan Cruz')).toBe('Juan Cruz')
    expect(getGreetingName('Octavio Benjamín')).toBe('Octavio Benjamín')
  })

  it('drops trailing surnames from a long legal name', () => {
    expect(getGreetingName('Octavio Benjamín Pérez García')).toBe('Octavio Benjamín')
  })

  it('collapses extra whitespace and trims', () => {
    expect(getGreetingName('  Juan   Cruz  ')).toBe('Juan Cruz')
  })

  it('truncates a single absurdly long token with an ellipsis', () => {
    const out = getGreetingName('Wolfeschlegelsteinhausenbergerdorff')
    expect(out.endsWith('…')).toBe(true)
    expect(out.length).toBeLessThanOrEqual(22)
  })

  it('falls back to "Usuario" for empty / nullish input', () => {
    expect(getGreetingName('')).toBe('Usuario')
    expect(getGreetingName('   ')).toBe('Usuario')
    expect(getGreetingName(null)).toBe('Usuario')
    expect(getGreetingName(undefined)).toBe('Usuario')
  })
})

describe('isPaydayPending', () => {
  it('monthly: true when cycle.start is past and last confirmation predates it', () => {
    const today = D(2026, 4, 20)
    const cycle = monthlyCycle(20, today) // cycle.start = apr 20
    expect(
      isPaydayPending(
        { cycle, lastConfirmedAt: UTC('2026-03-20T12:00:00Z').toISOString() },
        today,
      ),
    ).toBe(true)
  })

  it('monthly: false when last confirmation >= cycle.start', () => {
    const today = D(2026, 4, 20)
    const cycle = monthlyCycle(20, today)
    expect(
      isPaydayPending(
        { cycle, lastConfirmedAt: UTC('2026-04-20T09:00:00Z').toISOString() },
        today,
      ),
    ).toBe(false)
  })

  it('biweekly: true when latest cycle started and never confirmed', () => {
    const today = D(2026, 6, 5)
    // anchor may 23, today jun 5 (13d post) → cycle.start = may 23
    const cycle = biweeklyCycle('2026-05-23', today)
    expect(
      isPaydayPending({ cycle, lastConfirmedAt: null }, today),
    ).toBe(true)
  })

  it('biweekly: false when confirmed at the cycle start', () => {
    const today = D(2026, 6, 5)
    const cycle = biweeklyCycle('2026-05-23', today)
    expect(
      isPaydayPending(
        { cycle, lastConfirmedAt: UTC('2026-05-23T10:00:00Z').toISOString() },
        today,
      ),
    ).toBe(false)
  })

  it('returns false when cycle is null', () => {
    expect(
      isPaydayPending({ cycle: null, lastConfirmedAt: null }, new Date()),
    ).toBe(false)
  })
})
