import type { CategoryIconKey } from '@/components/category/category-icon-registry'
import type { IncomeEventKind } from './use-income-events'

/**
 * Catálogo de tipos de INGRESO (de 4 → 11). Módulo PURO (solo strings +
 * type-only imports) → testeable en el env 'node' de vitest sin cargar
 * React/registry. Fuente ÚNICA de presentación de ingresos: el picker de
 * "Agregar ingreso", las filas de actividad (`income-row`,
 * `home-activity-section`) y la card de Control consumen de acá. Antes cada
 * superficie duplicaba su propio mapeo de 4 kinds.
 *
 * - `icon`: sticker PNG (key de `CATEGORY_ICONS`) — picker + income-row.
 * - `emoji`: fallback glyph cuando el sticker no está / superficies que usan emoji.
 * - `materialIcon`: glyph monocromo (`MaterialIcons`) — card de Control.
 * - `labelKey`: `gastos:import.incomeKind.<camelKey>`.
 *
 * El union `IncomeEventKind` (use-income-events.ts) y el CHECK
 * `income_events_kind_check` en la DB deben mantenerse en sync con estas keys.
 */

// Subconjunto de nombres de MaterialIcons usados por los tipos de ingreso.
export type IncomeKindMaterialIcon =
  | 'account-balance'
  | 'computer'
  | 'sell'
  | 'workspace-premium'
  | 'trending-up'
  | 'home'
  | 'replay'
  | 'card-giftcard'
  | 'swap-horiz'
  | 'attach-money'

export interface IncomeKindMeta {
  key: IncomeEventKind
  labelKey: string
  icon: CategoryIconKey
  emoji: string
  materialIcon: IncomeKindMaterialIcon
}

// Orden de aparición en el picker: trabajo → pasivo → varios.
export const INCOME_KINDS: IncomeKindMeta[] = [
  { key: 'salary_extra', labelKey: 'gastos:import.incomeKind.salaryExtra', icon: 'finanzas/banco', emoji: '🏦', materialIcon: 'account-balance' },
  { key: 'freelance', labelKey: 'gastos:import.incomeKind.freelance', icon: 'extra/computadora', emoji: '💻', materialIcon: 'computer' },
  { key: 'sale', labelKey: 'gastos:import.incomeKind.sale', icon: 'finanzas/venta', emoji: '🏷️', materialIcon: 'sell' },
  { key: 'aguinaldo', labelKey: 'gastos:import.incomeKind.aguinaldo', icon: 'finanzas/bono', emoji: '🎖️', materialIcon: 'workspace-premium' },
  { key: 'bonus', labelKey: 'gastos:import.incomeKind.bonus', icon: 'finanzas/bonus', emoji: '⭐', materialIcon: 'workspace-premium' },
  { key: 'investment', labelKey: 'gastos:import.incomeKind.investment', icon: 'finanzas/inversiones', emoji: '📈', materialIcon: 'trending-up' },
  { key: 'rental', labelKey: 'gastos:import.incomeKind.rental', icon: 'vivienda/vivienda', emoji: '🏠', materialIcon: 'home' },
  { key: 'refund', labelKey: 'gastos:import.incomeKind.refund', icon: 'finanzas/cajero', emoji: '🧾', materialIcon: 'replay' },
  { key: 'gift', labelKey: 'gastos:import.incomeKind.gift', icon: 'servicios-general/regalos', emoji: '🎁', materialIcon: 'card-giftcard' },
  { key: 'transfer', labelKey: 'gastos:import.incomeKind.transfer', icon: 'finanzas/transferencia', emoji: '💸', materialIcon: 'swap-horiz' },
  { key: 'other', labelKey: 'gastos:import.incomeKind.other', icon: 'finanzas/billetera', emoji: '💵', materialIcon: 'attach-money' },
]

export const INCOME_KIND_VALUES: IncomeEventKind[] = INCOME_KINDS.map((k) => k.key)

/** Lookup O(1) por kind. Cubre los 11 valores de `IncomeEventKind`. */
export const INCOME_KIND_BY_KEY = Object.fromEntries(
  INCOME_KINDS.map((k) => [k.key, k]),
) as Record<IncomeEventKind, IncomeKindMeta>
