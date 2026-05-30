export const monthlyEditionsQueryKey = (familyId: string | undefined) =>
  ['monthly-editions', familyId ?? null] as const
