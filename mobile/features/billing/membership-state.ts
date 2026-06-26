/**
 * Lógica pura: estado del entitlement → variante visual del hero de
 * "Mi suscripción". Sin imports de RN/supabase (solo el tipo, que se borra
 * en compilación) → testeable en el env node de vitest.
 */
import i18n from '@/lib/i18n'
import { getIntlLocale } from '@/lib/i18n/active-locale'
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

/** Fecha corta locale-aware ("14 jun 2027" / "Jun 14, 2027"). Anclada a UTC
 *  para ser determinista (el día exacto de una renovación a un año vista es
 *  informativo, no debe correrse por TZ). Se usa Intl con timeZone:'UTC' para
 *  que el mes siga al idioma activo sin perder ese determinismo. */
export function formatDate(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return new Intl.DateTimeFormat(getIntlLocale(), {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(d)
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
      statusLabel: i18n.t('billing:membership.statusMvp'),
      heroLine: i18n.t('billing:membership.heroLineMvp'),
      primaryAction: null,
      canManage: false,
      note: i18n.t('billing:membership.noteMvp'),
    }
  }
  // Cortesía (acceso manual): no hay sub que gestionar.
  if (snap.source === 'comped') {
    return {
      tone: 'comped',
      statusLabel: i18n.t('billing:membership.statusComped'),
      heroLine: i18n.t('billing:membership.heroLineComped'),
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
      statusLabel: i18n.t('billing:membership.statusFamilyMember'),
      heroLine: i18n.t('billing:membership.heroLineFamilyMember'),
      primaryAction: null,
      canManage: false,
      note: i18n.t('billing:membership.noteFamilyMember'),
    }
  }
  // De aquí en adelante: el COMPRADOR (gestiona su propia sub).
  if (snap.subscriptionStatus === 'grace') {
    return {
      tone: 'warn',
      statusLabel: i18n.t('billing:membership.statusGrace'),
      heroLine: i18n.t('billing:membership.heroLineGrace', {
        date: formatDate(snap.graceExpiresAt),
      }),
      primaryAction: 'fixPayment',
      canManage: true,
    }
  }
  if (!snap.autoRenew) {
    return {
      tone: 'warn',
      statusLabel: i18n.t('billing:membership.statusNoRenew'),
      heroLine: i18n.t('billing:membership.heroLineNoRenew', {
        date: formatDate(snap.expiresAt),
      }),
      primaryAction: 'reactivate',
      canManage: true,
    }
  }
  return {
    tone: 'active',
    statusLabel: i18n.t('billing:membership.statusActive'),
    heroLine: i18n.t('billing:membership.heroLineActive', {
      date: formatDate(snap.expiresAt),
    }),
    primaryAction: 'change',
    canManage: true,
  }
}
