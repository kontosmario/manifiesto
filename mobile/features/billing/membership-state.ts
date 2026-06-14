/**
 * Lógica pura: estado del entitlement → variante visual del hero de
 * "Mi suscripción". Sin imports de RN/supabase (solo el tipo, que se borra
 * en compilación) → testeable en el env node de vitest.
 */
import type { EntitlementSnapshot } from '@/features/billing/entitlement-snapshot'

export type MembershipTone = 'active' | 'warn' | 'comped'

export interface MembershipVariant {
  tone: MembershipTone
  statusLabel: string
  heroLine: string
  primaryAction: 'change' | 'reactivate' | 'fixPayment' | null
}

const MESES = [
  'ene', 'feb', 'mar', 'abr', 'may', 'jun',
  'jul', 'ago', 'sep', 'oct', 'nov', 'dic',
]

/** Fecha corta es-AR ("14 jun 2027"). UTC para ser determinista (sin TZ ni
 *  Intl): el día exacto de una renovación a un año vista es informativo. */
export function formatDate(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return `${d.getUTCDate()} ${MESES[d.getUTCMonth()]} ${d.getUTCFullYear()}`
}

export function membershipVariant(
  snap: Pick<
    EntitlementSnapshot,
    'source' | 'subscriptionStatus' | 'autoRenew' | 'expiresAt' | 'graceExpiresAt'
  >,
): MembershipVariant {
  if (snap.source === 'comped') {
    return {
      tone: 'comped',
      statusLabel: 'CORTESÍA',
      heroLine: 'Acceso de cortesía',
      primaryAction: null,
    }
  }
  if (snap.subscriptionStatus === 'grace') {
    return {
      tone: 'warn',
      statusLabel: 'PROBLEMA DE PAGO',
      heroLine: `Reintentando hasta ${formatDate(snap.graceExpiresAt)}`,
      primaryAction: 'fixPayment',
    }
  }
  if (!snap.autoRenew) {
    return {
      tone: 'warn',
      statusLabel: 'NO SE RENOVARÁ',
      heroLine: `Habilitado hasta ${formatDate(snap.expiresAt)}`,
      primaryAction: 'reactivate',
    }
  }
  return {
    tone: 'active',
    statusLabel: 'ACTIVA',
    heroLine: `Se renueva el ${formatDate(snap.expiresAt)}`,
    primaryAction: 'change',
  }
}
