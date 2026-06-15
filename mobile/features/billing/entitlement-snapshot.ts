/**
 * Tipos + normalizador puros del snapshot de entitlement. Sin imports de
 * supabase/react-query para que sea testeable en el env node de vitest
 * (el hook `useEntitlement` que toca la red vive en use-entitlement.ts).
 *
 * Spec: docs/superpowers/specs/2026-06-12-apple-subscriptions-design.md
 */

/**
 * Valores que emite la RPC `resolve_entitlement` (cascada server-side). Una
 * suscripción PROPIA resuelve como 'family' (la familia es la unidad de
 * facturación), NO existe un source 'subscription' — el acceso pagado siempre
 * llega vía 'family'. `mvp` = super cuenta (acceso total de por vida, otorgado
 * por el super admin). Orden de precedencia: mvp > comped > family > trial > free.
 */
export type EntitlementSource = 'mvp' | 'comped' | 'family' | 'trial' | 'free'

export interface EntitlementSnapshot {
  source: EntitlementSource
  plan: string
  hasAccess: boolean
  /** Días restantes del período libre cuando `source==='trial'` (null si no). */
  daysLeft: number | null
  /** Estado del período libre PERSONAL del usuario, gane o no la cascada.
   *  Lo usa el aviso de salir-de-familia (si viene del hogar pero su trial
   *  ya venció, al salir cae a bloqueado). */
  trialDaysLeft: number
  expiresAt: string | null
  subscriptionStatus: string
  memberCap: number
  memberCount: number
  pendingProductId: string | null
  /** Renovación automática de la sub (true por defecto si el dato falta). */
  autoRenew: boolean
  /** Fin del período de gracia (pago fallido) cuando aplica; null si no. */
  graceExpiresAt: string | null
  /** ¿El usuario actual es QUIEN CONTRATÓ la sub? Un miembro cubierto por el
   *  hogar (source='family' pero !isPurchaser) no debe ver cambiar/cancelar.
   *  Default true (caso común: el que mira es el comprador). */
  isPurchaser: boolean
}

/** Default a prueba de fallos: si el RPC no devuelve fila, BLOQUEAMOS.
 *  Nunca otorgar acceso por defecto ante datos faltantes. */
export const BLOCKED_ENTITLEMENT: EntitlementSnapshot = {
  source: 'free',
  plan: 'free',
  hasAccess: false,
  daysLeft: 0,
  trialDaysLeft: 0,
  expiresAt: null,
  subscriptionStatus: 'none',
  memberCap: 2,
  memberCount: 1,
  pendingProductId: null,
  autoRenew: true,
  graceExpiresAt: null,
  isPurchaser: true,
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
    trialDaysLeft: Number(row.trial_days_left ?? 0),
    expiresAt: (row.expires_at as string) ?? null,
    subscriptionStatus: String(row.subscription_status ?? 'none'),
    memberCap: Number(row.member_cap ?? 2),
    memberCount: Number(row.member_count ?? 1),
    pendingProductId: (row.pending_product_id as string) ?? null,
    autoRenew: row.auto_renew == null ? true : Boolean(row.auto_renew),
    graceExpiresAt: (row.grace_expires_at as string) ?? null,
    isPurchaser: row.is_purchaser == null ? true : Boolean(row.is_purchaser),
  }
}
