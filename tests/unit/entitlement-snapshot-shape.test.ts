import { describe, expect, it } from 'vitest'
import { normalizeEntitlementSnapshot } from '@/features/billing/entitlement-snapshot'

describe('normalizeEntitlementSnapshot', () => {
  it('coacciona la fila del RPC a la forma del cliente (camelCase)', () => {
    const row = {
      source: 'trial',
      plan: 'trial',
      has_access: true,
      days_left: 12,
      trial_days_left: 12,
      expires_at: null,
      subscription_status: 'none',
      member_cap: 2,
      member_count: 1,
      pending_product_id: null,
    }
    expect(normalizeEntitlementSnapshot(row)).toEqual({
      source: 'trial',
      plan: 'trial',
      hasAccess: true,
      daysLeft: 12,
      trialDaysLeft: 12,
      expiresAt: null,
      subscriptionStatus: 'none',
      memberCap: 2,
      memberCount: 1,
      pendingProductId: null,
    })
  })

  it('default seguro cuando el RPC no devuelve fila → BLOQUEA', () => {
    const snap = normalizeEntitlementSnapshot(null)
    expect(snap.hasAccess).toBe(false)
    expect(snap.source).toBe('free')
  })

  it('familia con plan anual → cap 4', () => {
    const snap = normalizeEntitlementSnapshot({
      source: 'family',
      plan: 'yearly',
      has_access: true,
      days_left: null,
      member_cap: 4,
      member_count: 3,
    })
    expect(snap.hasAccess).toBe(true)
    expect(snap.daysLeft).toBeNull()
    expect(snap.memberCap).toBe(4)
  })
})
