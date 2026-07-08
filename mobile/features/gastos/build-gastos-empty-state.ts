// Empty-state factory para el SectionList de Gastos. Cuatro variants:
//
//  · `pending-confirm` — DB tiene expenses pero el cycle visible está
//    vacío (típicamente cycle frozen esperando confirm cobro).
//  · `global`          — no hay expenses para nada (fallback defensivo;
//    el "first-run account" se cubre con el `<GastosEmptyState>` afuera
//    del SectionList).
//  · `filtered`        — hay expenses pero el filter activo los oculta.
//  · `cycle`           — hay expenses fuera del cycle pero no en este.
//
// Extraído de `gastos-v2-screen.tsx` para que la screen pase un input
// chico (counts + flags + callbacks) y reciba el variant ya formado.
import type { MaterialIcons } from '@expo/vector-icons'
import type { ComponentProps } from 'react'
import i18n from '@/lib/i18n'

type IconName = ComponentProps<typeof MaterialIcons>['name']

export type GastosEmptyStateVariant =
  | 'pending-confirm'
  | 'global'
  | 'filtered'
  | 'cycle'

export interface GastosEmptyStateModel {
  kind: GastosEmptyStateVariant
  primary: string
  secondary: string
  actionLabel?: string
  onAction?: () => void
  iconName: IconName
}

export interface BuildGastosEmptyStateArgs {
  /** Cantidad total de expenses del cycle visible (sin filtros). */
  expensesCount: number
  /** Cantidad de expenses POST-filtros. */
  filteredCount: number
  hasAnyFilter: boolean
  /** DB tiene expenses recientes pero fuera del cycle visible (cycle
   *  frozen por falta de confirm cobro). */
  hasRecentExpensesOutsideCycle: boolean
  /** Modo ingreso variable: no existe "confirmar cobro", así que el
   *  variant `pending-confirm` no aplica — cae al empty neutro. */
  isDynamicIncome?: boolean
  /** Callback al tappear "Limpiar filtros" en el variant `filtered`. */
  onClearFilters: () => void
  /** Callback al tappear "Confirmar cobro" en el variant
   *  `pending-confirm`. Navega a home. */
  onGoToHome: () => void
}

export function buildGastosEmptyState(
  args: BuildGastosEmptyStateArgs,
): GastosEmptyStateModel | null {
  const {
    expensesCount,
    filteredCount,
    hasAnyFilter,
    hasRecentExpensesOutsideCycle,
    isDynamicIncome = false,
    onClearFilters,
    onGoToHome,
  } = args

  if (expensesCount === 0) {
    // Caso "DB tiene expenses pero cycle visible está vacío" — el user
    // ve este variant en vez del onboarding "primer gasto" engañoso.
    // El gate principal del isEmptyAccount ya valida que el branch del
    // SectionList se monte cuando hasRecentExpensesOutsideCycle es
    // true, así que esta condición aquí es defensiva.
    // Dinámico: no hay cobro que confirmar — al inicio de un ciclo
    // nuevo (semana/quincena) con actividad previa este variant pedía
    // "Confirma tu cobro", una acción que no existe en el modo.
    if (hasRecentExpensesOutsideCycle && !isDynamicIncome) {
      return {
        kind: 'pending-confirm',
        primary: i18n.t('gastos:emptyVariants.pendingConfirm.primary'),
        secondary: i18n.t('gastos:emptyVariants.pendingConfirm.secondary'),
        actionLabel: i18n.t('gastos:emptyVariants.pendingConfirm.action'),
        onAction: onGoToHome,
        iconName: 'event-available',
      }
    }
    // No empty-state CTA aquí a propósito — el home Variables band + el
    // Add tab ya cubren "registrar el primer gasto". Surfacearlo una
    // tercera vez es redundante.
    return {
      kind: 'global',
      primary: i18n.t('gastos:emptyVariants.global.primary'),
      secondary: i18n.t('gastos:emptyVariants.global.secondary'),
      actionLabel: undefined,
      onAction: undefined,
      iconName: 'add-circle-outline',
    }
  }
  if (filteredCount === 0 && hasAnyFilter) {
    return {
      kind: 'filtered',
      primary: i18n.t('gastos:emptyVariants.filtered.primary'),
      secondary: i18n.t('gastos:emptyVariants.filtered.secondary'),
      actionLabel: i18n.t('gastos:clearFilters.label'),
      onAction: onClearFilters,
      iconName: 'filter-alt-off',
    }
  }
  if (filteredCount === 0) {
    return {
      kind: 'cycle',
      primary: i18n.t('gastos:emptyVariants.cycle.primary'),
      secondary: i18n.t('gastos:emptyVariants.cycle.secondary'),
      actionLabel: undefined,
      onAction: undefined,
      iconName: 'hourglass-empty',
    }
  }
  return null
}
