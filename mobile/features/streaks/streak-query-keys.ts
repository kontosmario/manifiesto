export const streakQueryKey = (familyId?: string, userId?: string) =>
  ['user-streak', familyId ?? null, userId ?? null] as const

export const markedDaysQueryKey = (familyId?: string, userId?: string) =>
  ['streak-marked-days', familyId ?? null, userId ?? null] as const
