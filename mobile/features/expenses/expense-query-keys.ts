// LEAF: do not add imports from `@/features/*` here. This file is
// imported by `categories` and other domain modules — adding a
// feature dep would create the kind of cycle review #2 just broke.
export const expenseQueryKeys = {
  all: ['expenses'] as const,
  family: (familyId?: string) => ['expenses', familyId] as const,
  list: (familyId?: string, categoryId?: string) => ['expenses', familyId, categoryId] as const,
  /**
   * Histórico de expenses con `commitment_id` no-null — usado por
   * Fijos para calcular variación de precio entre pagos consecutivos.
   * Sin cap, separado del `list` que viene seeded por home_snapshot
   * con un cap de 120 filas que cortaba pagos viejos en familias con
   * mucho volumen.
   */
  commitmentHistory: (familyId?: string) =>
    ['expenses', familyId, 'commitment-history'] as const,
  recent: (familyId?: string, limit = 3) => ['expenses-recent', familyId, limit] as const,
  recentFamily: (familyId?: string) => ['expenses-recent', familyId] as const,
  total: (familyId?: string) => ['expenses-total', familyId] as const,
  periodTotal: (familyId?: string, startIso?: string, endIso?: string) =>
    ['expenses-period-total', familyId, startIso, endIso] as const,
  periodTotalFamily: (familyId?: string) => ['expenses-period-total', familyId] as const,
  monthlySpent: (familyId?: string, monthsBack = 6) =>
    ['expenses-monthly-spent', familyId, monthsBack] as const,
  monthlySpentFamily: (familyId?: string) => ['expenses-monthly-spent', familyId] as const,
}
