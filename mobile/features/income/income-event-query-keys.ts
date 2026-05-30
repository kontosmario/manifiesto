export const incomeEventQueryKeys = {
  all: ['income-events'] as const,
  list: (familyId: string | undefined) =>
    ['income-events', familyId ?? 'unknown'] as const,
  cycleSum: (familyId: string | undefined, startIso: string | undefined, endIso: string | undefined) =>
    ['income-events-cycle-sum', familyId ?? 'unknown', startIso ?? 'na', endIso ?? 'na'] as const,
}
