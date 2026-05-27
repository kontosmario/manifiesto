import { useEffect } from 'react'
import { type QueryClient, useQueryClient } from '@tanstack/react-query'
import { profileQueryKey } from '@/features/profile/use-profile'
import {
  deletePersistentValue,
  getPersistentValue,
  setPersistentValue,
} from '@/lib/persistent-kv'
import { supabase } from '@/lib/supabase'
import { clearTourPending, getPendingTours } from './tour-pending-store'
import { ALL_TOUR_KEYS, type TourKey } from './tour-keys'

const MIGRATION_DONE_KEY = 'tour-seen.migration-v2-done'
const LEGACY_PREFIX = 'tour-seen.'

function legacyKey(tour: TourKey): string {
  return `${LEGACY_PREFIX}${tour}`
}

export interface RunToursMigrationOnceInput {
  userId: string
  queryClient: QueryClient
}

/**
 * Drain any pending fallback flags (`tour-seen-pending.<key>` written
 * by a previously-failed `useMarkTourSeen` mutation) by re-issuing
 * the `mark_tour_seen` RPC and clearing the flag on success.
 *
 * Runs on EVERY launch — independent of the one-shot migration gate
 * — because new pending flags can accumulate any time after migration
 * has completed (every offline tour dismissal). Without this
 * unconditional retry path, a single failed mark after `migration-v2-done`
 * was set would never be retried until logout.
 *
 * On failure we leave the flag in place for the next launch. The RPC
 * is idempotent (COALESCE preserves the first-seen timestamp), so
 * re-issuing successful marks is a no-op server-side.
 *
 * Returns the list of keys whose marks succeeded — callers use this
 * to decide whether to invalidate the profile cache.
 */
async function drainPendingTours(): Promise<TourKey[]> {
  const pending = await getPendingTours()
  const drained: TourKey[] = []
  for (const key of pending) {
    const { error } = await supabase.rpc('mark_tour_seen', { tour_key: key })
    if (error) continue
    await clearTourPending(key)
    drained.push(key)
  }
  return drained
}

/**
 * One-shot legacy-flag migration plus unconditional pending drain.
 * Extracted from `useMigrateToursToBackend` so tests can drive it
 * without a React renderer.
 *
 * Two phases:
 *   • Legacy migration (gated by `tour-seen.migration-v2-done`):
 *     hoists any `tour-seen.<key>` flags from installs that predate
 *     backend sync. Runs once per device; the flag stays set after
 *     a successful drain so subsequent launches skip this phase.
 *   • Pending drain (unconditional): re-issues `mark_tour_seen` for
 *     any `tour-seen-pending.<key>` left by a failed mutation. Runs
 *     every launch — fallback flags can be written long after the
 *     legacy migration completed.
 *
 * Both phases share the same RPC and clear local flags on success.
 * If anything fails, the affected flag stays in place for next launch.
 */
export async function runToursMigrationOnce({
  userId,
  queryClient,
}: RunToursMigrationOnceInput): Promise<void> {
  const done = await getPersistentValue(MIGRATION_DONE_KEY)

  let invalidateNeeded = false

  // Phase 1 — legacy migration (one-shot)
  if (done !== '1') {
    const localSeen: TourKey[] = []
    for (const key of ALL_TOUR_KEYS) {
      const raw = await getPersistentValue(legacyKey(key))
      if (raw === '1') localSeen.push(key)
    }

    let allLegacySucceeded = true
    for (const key of localSeen) {
      const { error } = await supabase.rpc('mark_tour_seen', { tour_key: key })
      if (error) {
        allLegacySucceeded = false
        break
      }
    }

    if (allLegacySucceeded) {
      for (const key of localSeen) {
        await deletePersistentValue(legacyKey(key))
      }
      await setPersistentValue(MIGRATION_DONE_KEY, '1')
      if (localSeen.length > 0) invalidateNeeded = true
    }
  }

  // Phase 2 — pending drain (unconditional, every launch)
  const drained = await drainPendingTours()
  if (drained.length > 0) invalidateNeeded = true

  if (invalidateNeeded) {
    await queryClient.invalidateQueries({ queryKey: profileQueryKey(userId) })
  }
}

/**
 * Mounted in `AppEntryGate` so it runs once per session as the
 * profile becomes available. The legacy migration is one-shot per
 * device; the pending-drain phase runs every cold start to keep
 * offline-written fallback flags from accumulating indefinitely.
 */
export function useMigrateToursToBackend(userId: string | undefined): void {
  const queryClient = useQueryClient()

  useEffect(() => {
    if (!userId) return
    void runToursMigrationOnce({ userId, queryClient })
  }, [queryClient, userId])
}
