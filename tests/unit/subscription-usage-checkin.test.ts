import { describe, expect, it } from 'vitest'
import {
  scoreSubscriptionUsage,
  type SubscriptionCheckin,
} from '@/features/subscriptions-zombie/usage-checkin'

const NOW = new Date('2026-06-23T12:00:00')

function checkin(over: Partial<SubscriptionCheckin> = {}): SubscriptionCheckin {
  return {
    fixedExpenseId: 'fe1',
    name: 'Netflix',
    amount: 4500,
    lastPaymentAt: null,
    lastAuditAt: null,
    recentLevels: [],
    hasOpenCancelIntent: false,
    ...over,
  }
}

describe('scoreSubscriptionUsage', () => {
  it('ask-al-pagar: pago posterior a la última respuesta', () => {
    const r = scoreSubscriptionUsage(
      checkin({ lastPaymentAt: '2026-06-22T10:00:00', lastAuditAt: '2026-06-01T10:00:00' }),
      NOW,
    )
    expect(r.shouldAsk).toBe(true)
    expect(r.prompt).toBe('pay')
  })

  it('re-ask por timer >=15d, sin depender de payments', () => {
    const r = scoreSubscriptionUsage(
      checkin({ lastPaymentAt: null, lastAuditAt: '2026-06-05T10:00:00', recentLevels: ['a_veces'] }),
      NOW,
    )
    expect(r.shouldAsk).toBe(true)
    expect(r.prompt).toBe('reask')
  })

  it('respondió hace <15d → no preguntar', () => {
    const r = scoreSubscriptionUsage(
      checkin({ lastAuditAt: '2026-06-20T10:00:00', recentLevels: ['a_veces'] }),
      NOW,
    )
    expect(r.shouldAsk).toBe(false)
  })

  it('"mucho" resetea la racha y afloja la cadencia a 35d', () => {
    // 20 días desde la última respuesta: con REASK_DAYS_AFTER_HIGH=35 no pregunta.
    const r = scoreSubscriptionUsage(
      checkin({ lastAuditAt: '2026-06-03T12:00:00', recentLevels: ['mucho', 'casi_nunca', 'casi_nunca'] }),
      NOW,
    )
    expect(r.shouldAsk).toBe(false)
    expect(r.flag).toBe('none')
    expect(r.negativeStreak).toBe(0)
  })

  it('2 negativas seguidas → soft flag', () => {
    const r = scoreSubscriptionUsage(
      checkin({ lastAuditAt: '2026-06-01T10:00:00', recentLevels: ['a_veces', 'a_veces'] }),
      NOW,
    )
    expect(r.flag).toBe('soft')
    expect(r.negativeStreak).toBe(2)
  })

  it('3 negativas seguidas → hard flag', () => {
    const r = scoreSubscriptionUsage(
      checkin({ lastAuditAt: '2026-06-01T10:00:00', recentLevels: ['casi_nunca', 'a_veces', 'casi_nunca'] }),
      NOW,
    )
    expect(r.flag).toBe('hard')
    expect(r.negativeStreak).toBe(3)
  })

  it('2 casi_nunca seguidas → hard flag', () => {
    const r = scoreSubscriptionUsage(
      checkin({ lastAuditAt: '2026-06-01T10:00:00', recentLevels: ['casi_nunca', 'casi_nunca'] }),
      NOW,
    )
    expect(r.flag).toBe('hard')
  })

  it('array vacío / nunca preguntó ni pagó → no preguntar', () => {
    expect(scoreSubscriptionUsage(checkin(), NOW).shouldAsk).toBe(false)
  })

  it('robusto a level legacy desconocido (no crashea, score 0)', () => {
    const r = scoreSubscriptionUsage(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- legacy scaffolding
      checkin({ lastAuditAt: '2026-06-01T10:00:00', recentLevels: ['rarísimo' as any] }),
      NOW,
    )
    expect(r.negativeStreak).toBe(0)
    expect(r.flag).toBe('none')
  })
})
