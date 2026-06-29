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
 * AND diacritic-stripped so the match works whether the user typed
 * "Educación" or "Educacion".
 *
 * Post-compactación (2026-06-29): el catálogo variable se compactó a 13
 * categorías generales + Otros y ya NO incluye nombres solo-fijo
 * (Alquiler/Suscripciones/Impuestos se eliminaron, "Servicios" se renombró
 * a "Hogar"). Salud y Educación AHORA son categorías variables legítimas
 * (consulta puntual, un libro/curso) y deben mostrarse. Por eso el set
 * queda vacío — el filtro es identidad hoy, pero se conserva como punto de
 * extensión por si en el futuro hay que volver a ocultar algún nombre.
 */
const FIXED_ONLY_CATEGORY_NAMES = new Set<string>([])

function normalize(name: string): string {
  return name
    .normalize('NFD')
    // Strip combining diacritics (NFD splits "á" → "a" + U+0301).
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase()
}

export function filterVariableExpenseCategories(
  categories: readonly Category[],
): Category[] {
  return categories.filter(
    (c) => !FIXED_ONLY_CATEGORY_NAMES.has(normalize(c.name)),
  )
}
