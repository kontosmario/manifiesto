import { useEffect, useRef } from 'react'
import { getPersistentValue, setPersistentValue } from '@/lib/persistent-kv'
import { ALL_TOUR_KEYS } from './tour-keys'
import { setTourSeen } from './persistence'
import { TOURS_FEATURE_DEPLOYED_AT } from './backfill-config'
import { shouldBackfillToursAsSeen } from './should-backfill-tours'

const BACKFILL_DONE_KEY = 'tours-backfill-done'

/**
 * Ejecuta UNA VEZ por install el backfill descrito en
 * `should-backfill-tours.ts`. Idempotente vía un flag persistente
 * (`tours-backfill-done`). Pensado para invocarse en AppEntryGate
 * con `profile.onboarding_completed_at` como input.
 *
 * Casos:
 *   - Usuario existente (onboarding viejo): marca los 4 tours seen
 *     + setea el flag. No dispara ni interrumpe nada.
 *   - Usuario nuevo (onboarding reciente): solo setea el flag y se
 *     queda corto (deja que el auto-fire normal haga lo suyo).
 *   - profile aún cargando o sin onboarding: no hace nada (espera).
 */
export function useBackfillExistingUser(
  onboardingCompletedAt: string | null | undefined,
): void {
  const ranRef = useRef(false)
  useEffect(() => {
    if (ranRef.current) return
    if (onboardingCompletedAt === undefined) return
    let cancelled = false
    void (async () => {
      const flagRaw = await getPersistentValue(BACKFILL_DONE_KEY)
      const backfillAlreadyDone = flagRaw === '1'
      const decision = shouldBackfillToursAsSeen({
        onboardingCompletedAt: onboardingCompletedAt ?? null,
        toursDeployedAt: TOURS_FEATURE_DEPLOYED_AT,
        backfillAlreadyDone,
      })
      // TEMP_DIAG_TOURS_2026-05-26
      if (__DEV__) {
        console.warn('[diag backfill] decision', {
          onboardingCompletedAt,
          backfillAlreadyDone,
          toursDeployedAt: TOURS_FEATURE_DEPLOYED_AT,
          decision,
        })
      }
      if (cancelled) return
      if (decision) {
        await Promise.all(ALL_TOUR_KEYS.map((key) => setTourSeen(key)))
      }
      if (!backfillAlreadyDone) {
        await setPersistentValue(BACKFILL_DONE_KEY, '1')
      }
      ranRef.current = true
    })()
    return () => {
      cancelled = true
    }
  }, [onboardingCompletedAt])
}
