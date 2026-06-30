// Query keys del jardín. Archivo SIN dependencias (ni React ni Supabase) para
// poder importarlo desde `lib/sync-after-mutation.ts` sin crear el ciclo
// sync-after-mutation ← use-expenses ← use-garden.
export const gardenRecoveredQueryKey = (userId: string | undefined) =>
  ['garden_recovered_days', userId] as const
