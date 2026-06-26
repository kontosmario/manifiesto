import i18n from '@/lib/i18n'
import type { useThemeTokens } from '@/theme/theme-provider'

type FijoStatus = 'paid' | 'overdue' | 'pending' | 'future'

export interface StatusOverlayTokens {
  icon: 'check' | 'warning' | 'schedule'
  bg: string
  fg: string
  border: string
}

/**
 * Status visual movido del chip pastel a una OVERLAY mini-badge en la
 * iconWrap (similar al WhoPaidAvatar de GastoRow). Reduce ruido visual
 * en la sub-line + libera espacio para que el catChip respire como
 * en Gastos. Theme-aware overlay:
 *   paid     → check verde sobre lime tile
 *   overdue  → warning rojo (mora, más fuerte que peach)
 *   future   → check muted gris (cerrado, no requiere acción)
 *   pending  → schedule muted (sutil, no compite)
 */
export function computeStatusOverlay(
  status: FijoStatus,
  theme: ReturnType<typeof useThemeTokens>,
): StatusOverlayTokens {
  if (status === 'paid') {
    return {
      icon: 'check',
      bg: theme.isDark ? '#1F4530' : '#EAFBE4',
      fg: theme.isDark ? '#A6EF8F' : '#297811',
      border: theme.isDark ? '#A6EF8F' : '#297811',
    }
  }
  if (status === 'overdue') {
    return {
      icon: 'warning',
      bg: theme.isDark ? '#4A1B1B' : '#F8C8C8',
      fg: theme.isDark ? '#F18C8C' : '#A8211B',
      border: theme.isDark ? '#F18C8C' : '#A8211B',
    }
  }
  if (status === 'future') {
    return {
      icon: 'check',
      bg: theme.colors.pageBg,
      fg: theme.colors.textMuted,
      border: theme.colors.line,
    }
  }
  return {
    icon: 'schedule',
    bg: theme.colors.pageBg,
    fg: theme.colors.textMuted,
    border: theme.colors.line,
  }
}

export interface AccentPalette {
  solid: string
  bg: string
  border: string
}

/**
 * Accent palette derivada del status — usada para tintar el expand
 * panel (stats hero bg + accent stripe + border-top dashed). Cada
 * estado tiene su hue dedicado, sin overlap entre los 4:
 *   overdue → red brand (urgencia)
 *   pending → peach (acción por venir)
 *   paid    → lime (cerrado / positivo)
 *   future  → sky muted (calendario lejano)
 * Light: brand-deep saturado. Dark: brand-bright para contraste con
 * surfaceMuted near-black. Bgs en alpha bajo (0.06-0.10) para que
 * tinten sin compitir con el contenido.
 */
export function computeAccent(status: FijoStatus, isDark: boolean): AccentPalette {
  if (status === 'overdue') {
    return {
      solid: isDark ? '#F18C8C' : '#A8211B',
      bg: isDark ? 'rgba(241,140,140,0.12)' : 'rgba(168,33,27,0.07)',
      border: isDark ? 'rgba(241,140,140,0.36)' : 'rgba(168,33,27,0.25)',
    }
  }
  if (status === 'pending') {
    return {
      solid: isDark ? '#F2A78C' : '#B84014',
      bg: isDark ? 'rgba(242,167,140,0.10)' : 'rgba(184,64,20,0.06)',
      border: isDark ? 'rgba(242,167,140,0.32)' : 'rgba(184,64,20,0.22)',
    }
  }
  if (status === 'paid') {
    return {
      solid: isDark ? '#A6EF8F' : '#297811',
      bg: isDark ? 'rgba(166,239,143,0.10)' : 'rgba(41,120,17,0.06)',
      border: isDark ? 'rgba(166,239,143,0.32)' : 'rgba(41,120,17,0.22)',
    }
  }
  // future
  return {
    solid: isDark ? '#9DC4DE' : '#3F7CA3',
    bg: isDark ? 'rgba(157,196,222,0.10)' : 'rgba(63,124,163,0.06)',
    border: isDark ? 'rgba(157,196,222,0.32)' : 'rgba(63,124,163,0.22)',
  }
}

export interface DetailLabel {
  label: string
  icon: 'check-circle' | 'warning' | 'event' | 'schedule'
  /** True when the pending fijo is due today — drives the bolder weight
   *  in the row badge (kept as a flag so the UI doesn't string-compare
   *  the localized label). */
  isToday?: boolean
}

/**
 * Detail badge — pill compacto. Wording diseñado para CABER SIEMPRE
 * EN UNA SOLA LÍNEA. El icono carga la mayor parte del significado.
 *
 * Wording por status (todos ≤ 12 chars):
 *   overdue → "Vencida 11d"   (warning icon, "d" abreviado)
 *   pending → "En 5d"         (clock icon)
 *   pending today → "Hoy"     (clock icon, bold)
 *   paid    → "Pagada"        (check_circle)
 *   future  → "Próxima"       (event icon)
 *
 * Fallback sin next_due_on: copy genérico.
 */
export function computeDetail(
  status: FijoStatus,
  daysToNextDue: number | null,
): DetailLabel {
  if (status === 'paid') {
    return { label: i18n.t('fijos:row.detail.paid'), icon: 'check-circle' }
  }
  if (status === 'overdue') {
    const d = daysToNextDue != null ? Math.max(1, Math.abs(daysToNextDue)) : null
    return {
      label:
        d != null
          ? i18n.t('fijos:row.detail.overdueDays', { days: d })
          : i18n.t('fijos:row.detail.inArrears'),
      icon: 'warning',
    }
  }
  if (status === 'future') {
    return { label: i18n.t('fijos:row.detail.next'), icon: 'event' }
  }
  // pending
  if (daysToNextDue == null) {
    return { label: i18n.t('fijos:row.detail.pending'), icon: 'schedule' }
  }
  if (daysToNextDue === 0) {
    return { label: i18n.t('fijos:row.detail.today'), icon: 'schedule', isToday: true }
  }
  return {
    label: i18n.t('fijos:row.detail.inDays', { days: Math.abs(daysToNextDue) }),
    icon: 'schedule',
  }
}

/**
 * Accessibility label semantics para el status overlay.
 */
export function statusAccessibilityLabel(status: FijoStatus): string {
  switch (status) {
    case 'paid':
      return i18n.t('fijos:row.status.paid')
    case 'overdue':
      return i18n.t('fijos:row.status.overdue')
    case 'future':
      return i18n.t('fijos:row.status.future')
    default:
      return i18n.t('fijos:row.status.pending')
  }
}
