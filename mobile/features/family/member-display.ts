import type { FamilyMemberRole } from './use-family-admin'
import i18n from '@/lib/i18n'
import { getIntlLocale } from '@/lib/i18n/active-locale'

/** Etiqueta humana del rol para los badges. */
export function roleLabel(role: FamilyMemberRole): string {
  if (role === 'owner') return i18n.t('settings:role.owner')
  if (role === 'blocked') return i18n.t('settings:role.blocked')
  return i18n.t('settings:role.member')
}

/** "Integrante desde abril 2026" — fecha de alta del integrante. */
export function formatMemberSince(iso: string): string {
  const parsed = new Date(iso)
  if (Number.isNaN(parsed.getTime())) return i18n.t('settings:memberSince.fallback')
  try {
    const formatted = parsed.toLocaleDateString(getIntlLocale(), {
      month: 'long',
      year: 'numeric',
    })
    return i18n.t('settings:memberSince.label', { date: formatted })
  } catch {
    return i18n.t('settings:memberSince.fallback')
  }
}

/** "Hoy" / "Ayer" / "Hace N días" — última actividad relativa. */
export function formatRelative(iso: string | null): string {
  if (!iso) return i18n.t('settings:relative.noActivity')
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return i18n.t('settings:relative.noActivity')
  const diffMs = Date.now() - then
  const day = 24 * 60 * 60 * 1000
  const days = Math.floor(diffMs / day)
  if (days <= 0) return i18n.t('settings:relative.today')
  if (days === 1) return i18n.t('settings:relative.yesterday')
  if (days < 30) return i18n.t('settings:relative.daysAgo', { count: days })
  const months = Math.floor(days / 30)
  if (months < 12) return i18n.t('settings:relative.monthsAgo', { count: months })
  const years = Math.floor(days / 365)
  return i18n.t('settings:relative.yearsAgo', { count: years })
}
