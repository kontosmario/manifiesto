export const fixedExpenseQueryKeys = {
  all: ['fixed-expenses'] as const,
  family: (familyId?: string) => ['fixed-expenses', familyId] as const,
}
