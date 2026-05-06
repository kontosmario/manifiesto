// Cold-start biometric routing decision.
//
// When the user opens the app with no active session, the entry gate
// has two destinations:
//
//   ▸ /(auth)/welcome — the "Crear cuenta / Ya tengo cuenta" hero.
//     Right destination for FIRST-TIME users, but tedious for
//     returning users who've already enrolled biometrics.
//
//   ▸ /(auth)/login?autoBiometric=1 — the personalised hero with
//     the user's saved name + avatar. The login screen reads the
//     param and auto-triggers Face ID / Touch ID, so the user
//     doesn't have to tap anything to get back in.
//
// This hook reads the device's biometric setup once and tells the
// entry gate which route to pick. While it's loading the entry gate
// already shows a passive backdrop (the warm splash takes over), so
// the read latency is invisible.

import { useEffect, useState } from 'react'
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

export function useColdStartBiometricCheck(): ColdStartBiometricDecision {
  const [decision, setDecision] = useState<ColdStartBiometricDecision>({
    status: 'loading',
    shouldUseBiometric: false,
  })

  useEffect(() => {
    let cancelled = false
    void getBiometricLoginState()
      .then((state) => {
        if (cancelled) return
        setDecision({
          status: 'ready',
          shouldUseBiometric:
            state.isAvailable && state.hasSavedCredentials,
        })
      })
      .catch(() => {
        if (cancelled) return
        // Defensive: never block the entry gate on a biometric
        // probe failure. Fall through to the welcome hero.
        setDecision({ status: 'ready', shouldUseBiometric: false })
      })

    return () => {
      cancelled = true
    }
  }, [])

  return decision
}
