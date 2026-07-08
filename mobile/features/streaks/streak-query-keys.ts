// Keys de racha FAMILIAR (2026-07-08): la racha es del hogar, así que la
// cache se scopea por familia — sin userId, para que dos miembros en el
// mismo device compartan (y no fragmenten) el estado.
export const streakQueryKey = (familyId?: string) =>
  ['family-streak', familyId ?? null] as const

export const markedDaysQueryKey = (familyId?: string) =>
  ['streak-marked-days', familyId ?? null] as const
