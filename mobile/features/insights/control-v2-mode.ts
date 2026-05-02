// Classifies the Control v2 hook's render mode for a given account.
//
// Two independent flags drive different UI decisions:
//
//   - `noConfig`   → user hasn't configured a `monthly_income` yet.
//                    The CONTROL screen renders the global empty-state
//                    ("Configurar ingreso"). `data` falls back to the
//                    dev fixture (its values are never read in this
//                    mode — the empty-state replaces the card stack).
//
//   - `usingMock`  → broader: no income OR no expenses logged yet.
//                    Used by `signals` (forces empty), the asistente
//                    EmptyState ("Listos para empezar" copy) and
//                    `home-dashboard` (vault = 0). Stays true until
//                    the user has completed setup AND logged at least
//                    one expense.
//
// Why two? Because once the user finishes onboarding (income > 0),
// CONTROL can show a meaningful daily cupo — even with zero expenses
// the cards display "Día 1 de 30" placeholders for trend cards and
// real numbers for the cupo. We just don't surface advisor signals
// or recover the cycle vault until the user has actually spent.

import type { FamilyFinance } from '@/features/finance/use-family-finance'

export interface ClassifyControlModeInput {
  finance: FamilyFinance | undefined | null
  expensesCount: number
}

export interface ControlMode {
  noConfig: boolean
  usingMock: boolean
}

export function classifyControlMode(
  input: ClassifyControlModeInput,
): ControlMode {
  const hasIncome = Boolean(
    input.finance && (input.finance.monthly_income ?? 0) > 0,
  )
  const hasExpenses = input.expensesCount > 0
  return {
    noConfig: !hasIncome,
    usingMock: !hasIncome || !hasExpenses,
  }
}
