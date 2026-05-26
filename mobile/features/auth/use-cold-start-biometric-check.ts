import { useEffect, useRef, useState } from 'react'
import { getBiometricLoginState } from '@/lib/biometric-auth'

export type ColdStartBiometricStatus = 'loading' | 'ready'

export interface ColdStartBiometricDecision {
  status: ColdStartBiometricStatus
  /**
   * True when the device has biometrics enrolled AND the user has a
   * saved credential blob from a prior login on this install. The
   * entry gate uses this to redirect to the login screen with the
   * auto-biometric flag instead of the welcome hero.
   */
  shouldUseBiometric: boolean
}

/**
 * Resolves the biometric gate decision for AppEntryGate (or any other
 * consumer) keyed by the active session user.
 *
 * Re-evaluates when the session user changes — covers:
 *   ▸ cold start (initial probe)
 *   ▸ logout (sessionUserId → null; re-reads SecureStore which logout
 *     already cleared, returning shouldUseBiometric=false)
 *   ▸ different user signing in on the same device
 *
 * While re-evaluating after a change we briefly flip back to 'loading'
 * so AppEntryGate's isLoading guard waits for the fresh probe before
 * routing (otherwise the previous user's stale decision would route the
 * current screen one tick too long).
 */
export function useColdStartBiometricCheck(
  sessionUserId: string | null | undefined,
): ColdStartBiometricDecision {
  // probedFor tracks which userId the current `decision` was resolved
  // for. When it differs from sessionUserId, we are mid-probe → status
  // is 'loading', regardless of the stored decision value.
  const probedFor = useRef<string | null | undefined>(undefined)

  const [decision, setDecision] = useState<ColdStartBiometricDecision>({
    status: 'loading',
    shouldUseBiometric: false,
  })

  // Derive status: if the last completed probe was for a different user
  // than the current sessionUserId, the hook is still loading.
  const status: ColdStartBiometricStatus =
    probedFor.current === sessionUserId ? decision.status : 'loading'

  useEffect(() => {
    let cancelled = false
    void getBiometricLoginState()
      .then((state) => {
        if (cancelled) return
        probedFor.current = sessionUserId
        setDecision({
          status: 'ready',
          shouldUseBiometric: state.isAvailable && state.hasSavedCredentials,
        })
      })
      .catch(() => {
        if (cancelled) return
        // Defensive: never block the entry gate on a biometric probe
        // failure. Fall through to the welcome hero.
        probedFor.current = sessionUserId
        setDecision({ status: 'ready', shouldUseBiometric: false })
      })

    return () => {
      cancelled = true
    }
  }, [sessionUserId])

  return { ...decision, status }
}
