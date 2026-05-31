/**
 * Canonical Spanish-language terminology used across the app's UI
 * copy. Centralizing these terms here keeps a single source of
 * truth — feature copy should reference `terms.expense` rather than
 * inlining the literal "Gasto", so renames propagate.
 *
 * Asserted by tests/unit/copy-glossary.test.ts.
 */
export const terms = {
  expense: 'Gasto',
  expensePlural: 'Gastos',
  currentCycle: 'Este ciclo',
  available: 'Disponible',
  margin: 'Margen',
  payday: 'Día de cobro',
  fixedExpense: 'Gasto fijo',
  fixedExpensePlural: 'Gastos fijos',
  history: 'Historial',
} as const

export type TermKey = keyof typeof terms
