export const expenseQueryKeys = {
  all: ['expenses'] as const,
  family: (familyId?: string) => ['expenses', familyId] as const,
  list: (familyId?: string, categoryId?: string) => ['expenses', familyId, categoryId] as const,
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
