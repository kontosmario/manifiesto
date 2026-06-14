import { describe, expect, it } from 'vitest'
import {
  normalizeEntitlementSnapshot,
  BLOCKED_ENTITLEMENT,
} from '@/features/billing/entitlement-snapshot'

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
      autoRenew: true,
      graceExpiresAt: null,
      isPurchaser: true,
    })
  })

  it('is_purchaser: ausente → true (default); false → false', () => {
    expect(normalizeEntitlementSnapshot({ source: 'family' }).isPurchaser).toBe(
      true,
    )
    expect(
      normalizeEntitlementSnapshot({ source: 'family', is_purchaser: false })
        .isPurchaser,
    ).toBe(false)
  })

  it('mapea auto_renew y grace_expires_at de la fila', () => {
    const snap = normalizeEntitlementSnapshot({
      source: 'subscription',
      plan: 'yearly',
      has_access: true,
      auto_renew: false,
      grace_expires_at: '2026-06-18T00:00:00Z',
    })
    expect(snap.autoRenew).toBe(false)
    expect(snap.graceExpiresAt).toBe('2026-06-18T00:00:00Z')
  })

  it('auto_renew ausente → default true; grace ausente → null', () => {
    const snap = normalizeEntitlementSnapshot({ source: 'subscription' })
    expect(snap.autoRenew).toBe(true)
    expect(snap.graceExpiresAt).toBeNull()
  })

  it('default bloqueado: autoRenew true, graceExpiresAt null', () => {
    expect(BLOCKED_ENTITLEMENT.autoRenew).toBe(true)
    expect(BLOCKED_ENTITLEMENT.graceExpiresAt).toBeNull()
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
