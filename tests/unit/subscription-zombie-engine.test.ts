import { describe, expect, it } from 'vitest'
import {
  buildFeed,
  classifyAudit,
  isAuditCandidate,
  isInCooldown,
} from '@/features/subscriptions-zombie/subscription-audit-engine'
import type {
  ActionIntentRecord,
  FamilyMemberRow,
  FixedExpenseRow,
  PaymentRow,
  UsageAuditRecord,
  UsageLevel,
} from '@/features/subscriptions-zombie/types'

const baseFijo: FixedExpenseRow = {
  id: 'fe-1',
  familyId: 'fam-1',
  name: 'Disney+',
  amount: 18400,
  kind: 'recurring',
  status: 'active',
  frequency: 'monthly',
  categoryId: 'cat-subs',
  categoryName: 'Suscripciones',
  categoryScope: 'fixed_expense',
  nextDueOn: null,
  lastPaidAt: null,
  createdAt: new Date('2026-01-01T00:00:00Z').toISOString(),
}

const now = new Date('2026-05-01T00:00:00Z')

const auditRow = (
  userId: string,
  level: UsageLevel,
  overrides: Partial<UsageAuditRecord> = {},
): UsageAuditRecord => ({
  id: `a-${userId}-${overrides.period ?? '2026-05'}`,
  fixedExpenseId: 'fe-1',
  familyId: 'fam-1',
  userId,
  period: '2026-05',
  level,
  createdAt: '2026-05-01T00:00:00Z',
  ...overrides,
})

const members: FamilyMemberRow[] = [
  { userId: 'u1', name: 'Mario' },
  { userId: 'u2', name: 'Aye' },
]

describe('isAuditCandidate', () => {
  it('returns true for a normal subscription past 60 days', () => {
    expect(isAuditCandidate(baseFijo, now)).toBe(true)
  })

  it('rejects fijos under 60 days', () => {
    const young = { ...baseFijo, createdAt: new Date('2026-04-15T00:00:00Z').toISOString() }
    expect(isAuditCandidate(young, now)).toBe(false)
  })

  it('rejects non-recurring kinds', () => {
    expect(isAuditCandidate({ ...baseFijo, kind: 'installment' }, now)).toBe(false)
    expect(isAuditCandidate({ ...baseFijo, kind: 'debt' }, now)).toBe(false)
    expect(isAuditCandidate({ ...baseFijo, kind: 'periodic' }, now)).toBe(false)
  })

  it('rejects non-active status', () => {
    expect(isAuditCandidate({ ...baseFijo, status: 'paused' }, now)).toBe(false)
    expect(isAuditCandidate({ ...baseFijo, status: 'archived' }, now)).toBe(false)
  })

  it('rejects fijos without Suscripciones category', () => {
    expect(isAuditCandidate({ ...baseFijo, categoryName: 'Servicios' }, now)).toBe(false)
    expect(isAuditCandidate({ ...baseFijo, categoryName: null }, now)).toBe(false)
    expect(isAuditCandidate({ ...baseFijo, categoryScope: 'expense' }, now)).toBe(false)
  })

  it('rejects unsupported frequencies', () => {
    expect(isAuditCandidate({ ...baseFijo, frequency: 'quarterly' }, now)).toBe(false)
    expect(isAuditCandidate({ ...baseFijo, frequency: 'annual' }, now)).toBe(false)
  })

  it('accepts weekly and biweekly', () => {
    expect(isAuditCandidate({ ...baseFijo, frequency: 'weekly' }, now)).toBe(true)
    expect(isAuditCandidate({ ...baseFijo, frequency: 'biweekly' }, now)).toBe(true)
  })
})

describe('classifyAudit', () => {
  it('returns zombie_consensuado when all responders said casi_nunca', () => {
    const audits = [auditRow('u1', 'casi_nunca'), auditRow('u2', 'casi_nunca')]
    expect(classifyAudit(audits, members)).toBe('zombie_consensuado')
  })

  it('returns uso_desigual when mix of casi_nunca and mucho', () => {
    const audits = [auditRow('u1', 'casi_nunca'), auditRow('u2', 'mucho')]
    expect(classifyAudit(audits, members)).toBe('uso_desigual')
  })

  it('returns indecisa when only a_veces', () => {
    const audits = [auditRow('u1', 'a_veces'), auditRow('u2', 'a_veces')]
    expect(classifyAudit(audits, members)).toBe('indecisa')
  })

  it('returns uso_desigual when mix of casi_nunca and a_veces', () => {
    const audits = [auditRow('u1', 'casi_nunca'), auditRow('u2', 'a_veces')]
    expect(classifyAudit(audits, members)).toBe('uso_desigual')
  })

  it('returns parcial when fewer than 50% members responded', () => {
    const fourMembers: FamilyMemberRow[] = [
      { userId: 'u1', name: 'A' },
      { userId: 'u2', name: 'B' },
      { userId: 'u3', name: 'C' },
      { userId: 'u4', name: 'D' },
    ]
    const audits = [auditRow('u1', 'casi_nunca')]
    expect(classifyAudit(audits, fourMembers)).toBe('parcial')
  })

  it('returns no_zombie when all members responded mucho', () => {
    const audits = [auditRow('u1', 'mucho'), auditRow('u2', 'mucho')]
    expect(classifyAudit(audits, members)).toBe('no_zombie')
  })
})

describe('isInCooldown', () => {
  it('returns false when no prior audits', () => {
    expect(isInCooldown([], [], new Date('2026-05-01T00:00:00Z'), members)).toBe(false)
  })

  it('returns true 30d after no_zombie classification (180d cooldown)', () => {
    const audits = [
      auditRow('u1', 'mucho', { period: '2026-04', createdAt: '2026-04-01T00:00:00Z' }),
      auditRow('u2', 'mucho', { period: '2026-04', createdAt: '2026-04-01T00:00:00Z' }),
    ]
    expect(isInCooldown(audits, [], new Date('2026-05-01T00:00:00Z'), members)).toBe(true)
  })

  it('returns false 200d after no_zombie classification', () => {
    const audits = [
      auditRow('u1', 'mucho', { period: '2025-10', createdAt: '2025-10-01T00:00:00Z' }),
      auditRow('u2', 'mucho', { period: '2025-10', createdAt: '2025-10-01T00:00:00Z' }),
    ]
    expect(isInCooldown(audits, [], new Date('2026-05-01T00:00:00Z'), members)).toBe(false)
  })

  it('returns true after abandoned intent (180d)', () => {
    const intent: ActionIntentRecord = {
      id: 'i1',
      fixedExpenseId: 'fe-1',
      familyId: 'fam-1',
      userId: 'u1',
      intent: 'cancel',
      declaredAt: '2026-04-01T00:00:00Z',
      resolvedAt: '2026-04-05T00:00:00Z',
      resolution: 'abandoned',
      notes: null,
    }
    expect(isInCooldown([], [intent], new Date('2026-05-01T00:00:00Z'), members)).toBe(true)
  })
})

describe('buildFeed', () => {
  it('returns no items for non-candidate fijos', () => {
    const result = buildFeed({
      fixedExpenses: [{ ...baseFijo, status: 'archived' }],
      audits: [],
      intents: [],
      payments: [],
      members,
      now: new Date('2026-05-01T00:00:00Z'),
    })
    expect(result.feed).toHaveLength(0)
  })

  it('returns pending_audit for a candidate without responses', () => {
    const result = buildFeed({
      fixedExpenses: [baseFijo],
      audits: [],
      intents: [],
      payments: [],
      members,
      now: new Date('2026-05-01T00:00:00Z'),
    })
    expect(result.feed).toHaveLength(1)
    expect(result.feed[0].classification).toBe('pending_audit')
  })

  it('returns zombie_consensuado when all responded casi_nunca and no intent yet', () => {
    const audits = [
      auditRow('u1', 'casi_nunca'),
      auditRow('u2', 'casi_nunca'),
    ]
    const result = buildFeed({
      fixedExpenses: [baseFijo],
      audits,
      intents: [],
      payments: [],
      members,
      now: new Date('2026-05-15T00:00:00Z'),
    })
    expect(result.feed[0].classification).toBe('zombie_consensuado')
    expect(result.feed[0].openIntent).toBeNull()
  })

  it('exposes openIntent and follow-up kind when payment recurred after declared_at', () => {
    const intent: ActionIntentRecord = {
      id: 'i-1',
      fixedExpenseId: 'fe-1',
      familyId: 'fam-1',
      userId: 'u1',
      intent: 'cancel',
      declaredAt: '2026-05-15T00:00:00Z',
      resolvedAt: null,
      resolution: null,
      notes: null,
    }
    const payment: PaymentRow = {
      id: 'p-1',
      fixedExpenseId: 'fe-1',
      paymentPeriod: '2026-06',
      amount: 18400,
      createdAt: '2026-06-22T00:00:00Z',
    }
    const result = buildFeed({
      fixedExpenses: [baseFijo],
      audits: [auditRow('u1', 'casi_nunca'), auditRow('u2', 'casi_nunca')],
      intents: [intent],
      payments: [payment],
      members,
      now: new Date('2026-06-25T00:00:00Z'),
    })
    expect(result.feed[0].openIntent?.id).toBe('i-1')
    expect(result.feed[0].followUpKind).toBe('payment_recurred')
  })

  it('skips fijos in cooldown after no_zombie', () => {
    const audits = [
      auditRow('u1', 'mucho', { period: '2026-04', createdAt: '2026-04-15T00:00:00Z' }),
      auditRow('u2', 'mucho', { period: '2026-04', createdAt: '2026-04-15T00:00:00Z' }),
    ]
    const result = buildFeed({
      fixedExpenses: [baseFijo],
      audits,
      intents: [],
      payments: [],
      members,
      now: new Date('2026-05-01T00:00:00Z'),
    })
    expect(result.feed).toHaveLength(0)
  })
})
