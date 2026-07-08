// Query keys del jardín. Archivo SIN dependencias (ni React ni Supabase) para
// poder importarlo desde `lib/sync-after-mutation.ts` sin crear el ciclo
// sync-after-mutation ← use-expenses ← use-garden.
// Familiar (2026-07-08): los días recuperados son del hogar → key por familia.
export const gardenRecoveredQueryKey = (familyId: string | undefined) =>
  ['garden_recovered_days', familyId] as const
