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
  /** ¿Este usuario puede gestionar la sub? false para un miembro CUBIERTO por
   *  el hogar (no la contrató) y para cortesía: ocultan cambiar/cancelar. */
  canManage: boolean
  /** Nota aclaratoria opcional (p.ej. para el miembro cubierto). */
  note?: string
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
    | 'source'
    | 'subscriptionStatus'
    | 'autoRenew'
    | 'expiresAt'
    | 'graceExpiresAt'
    | 'isPurchaser'
  >,
): MembershipVariant {
  // MVP — super cuenta: acceso total de por vida, sin sub ni cobro.
  if (snap.source === 'mvp') {
    return {
      tone: 'active',
      statusLabel: 'MVP',
      heroLine: 'Acceso total de por vida',
      primaryAction: null,
      canManage: false,
      note: 'Tu cuenta tiene acceso completo, sin vencimiento.',
    }
  }
  // Cortesía (acceso manual): no hay sub que gestionar.
  if (snap.source === 'comped') {
    return {
      tone: 'comped',
      statusLabel: 'CORTESÍA',
      heroLine: 'Acceso de cortesía',
      primaryAction: null,
      canManage: false,
    }
  }
  // Miembro CUBIERTO por el hogar (no contrató la sub): ve su acceso pero no
  // puede cambiar/cancelar un plan ajeno. Va ANTES de grace/auto-renew porque
  // esos estados son del comprador y el miembro no puede accionarlos.
  if (snap.source === 'family' && !snap.isPurchaser) {
    return {
      tone: 'active',
      statusLabel: 'MIEMBRO DEL HOGAR',
      heroLine: 'Tu hogar cubre tu acceso',
      primaryAction: null,
      canManage: false,
      note: 'El plan lo administra quien lo contrató en tu hogar.',
    }
  }
  // De acá en adelante: el COMPRADOR (gestiona su propia sub).
  if (snap.subscriptionStatus === 'grace') {
    return {
      tone: 'warn',
      statusLabel: 'PROBLEMA DE PAGO',
      heroLine: `Reintentando hasta ${formatDate(snap.graceExpiresAt)}`,
      primaryAction: 'fixPayment',
      canManage: true,
    }
  }
  if (!snap.autoRenew) {
    return {
      tone: 'warn',
      statusLabel: 'NO SE RENOVARÁ',
      heroLine: `Habilitado hasta ${formatDate(snap.expiresAt)}`,
      primaryAction: 'reactivate',
      canManage: true,
    }
  }
  return {
    tone: 'active',
    statusLabel: 'ACTIVA',
    heroLine: `Se renueva el ${formatDate(snap.expiresAt)}`,
    primaryAction: 'change',
    canManage: true,
  }
}
