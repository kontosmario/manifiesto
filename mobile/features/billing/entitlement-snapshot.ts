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

/**
 * Estado de la query de entitlement que alcanza para decidir si el árbol
 * de la app puede pintar. Sólo los campos que miramos, para que el
 * predicado sea puro y testeable sin React Query.
 */
export interface EntitlementQueryState {
  data: EntitlementSnapshot | null | undefined
  isError: boolean
  /** La query resolvió DESPUÉS de montar (no vino del disco). */
  isFetchedAfterMount: boolean
  /** El dato en cache pasó su staleTime. */
  isStale: boolean
}

/**
 * ¿Podemos confiar en el entitlement para decidir el acceso?
 *
 * El acceso lo decide el SERVER, así que la app espera su respuesta antes
 * de pintar el árbol; si no, una cuenta con el acceso pausado alcanza a
 * ver su Home real antes de que el gate la tape.
 *
 * Tres formas de estar listo:
 *  · `isFetchedAfterMount` — lo trajo esta sesión, es la palabra fresca.
 *  · dato en cache y NO stale — el persister restauró algo de hace menos
 *    de un staleTime; toda compra invalida la key, así que sigue siendo
 *    la decisión vigente. Sin esta rama nos quedaríamos esperando un
 *    refetch que React Query no va a hacer (el dato está fresco).
 *  · `isError` — dejamos pasar. El gate falla ABIERTO sin dato, y clavar
 *    el splash por un blip de red es peor que un ciclo sin bloquear. El
 *    último snapshot conocido sigue en cache para el modo sin conexión.
 */
export function isEntitlementResolved(q: EntitlementQueryState): boolean {
  if (q.isError) return true
  if (q.isFetchedAfterMount) return true
  return q.data != null && !q.isStale
}
