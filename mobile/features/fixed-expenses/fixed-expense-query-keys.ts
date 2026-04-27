export const fixedExpenseQueryKeys = {
  all: ['fixed-expenses'] as const,
  family: (familyId?: string) => ['fixed-expenses', familyId] as const,
  /** Prefix that matches every period variant of the payments query
   * (see fixedExpensePaymentsKey). Use with invalidateQueries to
   * refresh all periods at once. */
  paymentsFamily: (familyId?: string) =>
    ['fixed-expense-payments', familyId ?? null] as const,
}
