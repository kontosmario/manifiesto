/**
 * Tipos + normalizador puros del snapshot de entitlement. Sin imports de
 * supabase/react-query para que sea testeable en el env node de vitest
 * (el hook `useEntitlement` que toca la red vive en use-entitlement.ts).
 *
 * Spec: docs/superpowers/specs/2026-06-12-apple-subscriptions-design.md
 */

export type EntitlementSource =
  | 'comped'
  | 'family'
  | 'trial'
  | 'subscription'
  | 'free'

export interface EntitlementSnapshot {
  source: EntitlementSource
  plan: string
  hasAccess: boolean
  daysLeft: number | null
  expiresAt: string | null
  subscriptionStatus: string
  memberCap: number
  memberCount: number
  pendingProductId: string | null
}

/** Default a prueba de fallos: si el RPC no devuelve fila, BLOQUEAMOS.
 *  Nunca otorgar acceso por defecto ante datos faltantes. */
export const BLOCKED_ENTITLEMENT: EntitlementSnapshot = {
  source: 'free',
  plan: 'free',
  hasAccess: false,
  daysLeft: 0,
  expiresAt: null,
  subscriptionStatus: 'none',
  memberCap: 2,
  memberCount: 1,
  pendingProductId: null,
}

export function normalizeEntitlementSnapshot(
  row: Record<string, unknown> | null,
): EntitlementSnapshot {
  if (!row) return BLOCKED_ENTITLEMENT
  return {
    source: (row.source as EntitlementSource) ?? 'free',
    plan: String(row.plan ?? 'free'),
    hasAccess: Boolean(row.has_access),
    daysLeft: row.days_left == null ? null : Number(row.days_left),
    expiresAt: (row.expires_at as string) ?? null,
    subscriptionStatus: String(row.subscription_status ?? 'none'),
    memberCap: Number(row.member_cap ?? 2),
    memberCount: Number(row.member_count ?? 1),
    pendingProductId: (row.pending_product_id as string) ?? null,
  }
}
