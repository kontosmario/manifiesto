import { useEffect } from 'react'
import { type QueryClient, useQueryClient } from '@tanstack/react-query'
import { profileQueryKey } from '@/features/profile/use-profile'
import {
  deletePersistentValue,
  getPersistentValue,
  setPersistentValue,
} from '@/lib/persistent-kv'
import { supabase } from '@/lib/supabase'
import { getPendingTours } from './tour-pending-store'
import { ALL_TOUR_KEYS, type TourKey } from './tour-keys'

const MIGRATION_DONE_KEY = 'tour-seen.migration-v2-done'
const LEGACY_PREFIX = 'tour-seen.'
const PENDING_PREFIX = 'tour-seen-pending.'

function legacyKey(tour: TourKey): string {
  return `${LEGACY_PREFIX}${tour}`
}

function pendingKey(tour: TourKey): string {
  return `${PENDING_PREFIX}${tour}`
}

export interface RunToursMigrationOnceInput {
  userId: string
  queryClient: QueryClient
}

/**
 * Pure one-shot migration. Extracted from `useMigrateToursToBackend`
 * so tests can drive it without a React renderer. Steps:
 *
 *   1. Bail early if `tour-seen.migration-v2-done` is already set.
 *   2. Collect any legacy `tour-seen.<key>` flags (from before
 *      backend sync existed) plus any `tour-seen-pending.<key>`
 *      flags left by previously-failed `useMarkTourSeen` mutations.
 *   3. Hoist each unique key to the backend via `mark_tour_seen`.
 *      If any RPC fails, return WITHOUT setting the migration-done
 *      flag — the next launch will retry the full set.
 *   4. Clean up the local legacy + pending flags.
 *   5. Mark the migration as done.
 *   6. Invalidate the profile cache so the new state surfaces.
 */
export async function runToursMigrationOnce({
  userId,
  queryClient,
}: RunToursMigrationOnceInput): Promise<void> {
  const done = await getPersistentValue(MIGRATION_DONE_KEY)
  if (done === '1') return

  const localSeen: TourKey[] = []
  for (const key of ALL_TOUR_KEYS) {
    const raw = await getPersistentValue(legacyKey(key))
    if (raw === '1') localSeen.push(key)
  }

  const pending = await getPendingTours()

  const toHoist = Array.from(new Set<TourKey>([...localSeen, ...pending]))

  for (const key of toHoist) {
    const { error } = await supabase.rpc('mark_tour_seen', { tour_key: key })
    if (error) {
      // Leave everything as-is for retry on the next launch.
      return
    }
  }

  for (const key of localSeen) {
    await deletePersistentValue(legacyKey(key))
  }
  for (const key of pending) {
    await deletePersistentValue(pendingKey(key))
  }

  await setPersistentValue(MIGRATION_DONE_KEY, '1')

  if (toHoist.length > 0) {
    await queryClient.invalidateQueries({ queryKey: profileQueryKey(userId) })
  }
}

/**
 * One-shot migration hook: lifts any local `tour-seen.<key>` flags
 * (legacy, from before backend sync existed) to the backend via
 * `mark_tour_seen`, plus retries any `tour-seen-pending.*` flags
 * left behind by failed `useMarkTourSeen` mutations. Cleans up the
 * local flags on success and writes `tour-seen.migration-v2-done`
 * so it doesn't re-run.
 *
 * Idempotent: if any RPC fails, the migration-done flag is NOT
 * set and the next launch retries everything.
 *
 * Mounted in `AppEntryGate` so it runs once per session as the
 * profile becomes available.
 */
export function useMigrateToursToBackend(userId: string | undefined): void {
  const queryClient = useQueryClient()

  useEffect(() => {
    if (!userId) return
    void runToursMigrationOnce({ userId, queryClient })
  }, [queryClient, userId])
}
