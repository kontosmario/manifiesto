// Variable-expense category filter.
//
// Background: the data layer keeps every default category at
// `scope='expense'` (see migration 20260424160000_consolidate_gastos_categories.sql).
// That includes "Alquiler", "Servicios" and "Suscripciones" — names
// that are inherently recurring fijos and shouldn't show up in the
// add-variable-expense picker.
//
// We can't change `scope` without unwinding the consolidation
// migration, and the fijos add flow legitimately wants the full
// catalog (a fijo can be Alquiler, Servicios, Mercado, anything).
// So we filter at the consumer that's specific to variable-only
// expenses (`use-add-expense-controller`).
//
// The match is case-insensitive on the trimmed name. We deliberately
// do NOT match on substrings — if the user has renamed their
// "Alquiler" category to "Alquiler de auto" they're signaling intent
// to record one-off rentals, and the filter respects that.

import type { Category } from '@/features/categories/use-categories'

/**
 * Canonical names of categories that are always recurring fijos and
 * therefore hidden from the variable-expense picker. Stored lowercase
 * for case-insensitive matching.
 */
const FIXED_ONLY_CATEGORY_NAMES = new Set<string>([
  'alquiler',
  'servicios',
  'suscripciones',
])

export function filterVariableExpenseCategories(
  categories: readonly Category[],
): Category[] {
  return categories.filter(
    (c) => !FIXED_ONLY_CATEGORY_NAMES.has(c.name.trim().toLowerCase()),
  )
}
