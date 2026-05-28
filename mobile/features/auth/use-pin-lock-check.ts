import { useEffect, useRef, useState } from 'react'
import { getPinLockState } from '@/lib/pin-lock'

export type PinLockStatus = 'loading' | 'ready'

export interface PinLockDecision {
  status: PinLockStatus
  /** True when a PIN is set on this device for the active user. */
  isSet: boolean
}

/**
 * Resolves the PIN-lock decision for AppEntryGate, keyed by the active
 * session user. Mirrors `useColdStartBiometricCheck`: re-evaluates when
 * the session user changes (cold start, logout, different user) and
 * briefly reports 'loading' during the re-probe so the gate waits for a
 * fresh read before routing (avoids a stale decision bypassing the
 * lock for one tick).
 */
export function usePinLockCheck(
  sessionUserId: string | null | undefined,
): PinLockDecision {
  const probedFor = useRef<string | null | undefined>(undefined)
  const [decision, setDecision] = useState<PinLockDecision>({
    status: 'loading',
    isSet: false,
  })

  const status: PinLockStatus =
    probedFor.current === sessionUserId ? decision.status : 'loading'

  useEffect(() => {
    let cancelled = false
    void getPinLockState()
      .then((state) => {
        if (cancelled) return
        probedFor.current = sessionUserId
        setDecision({ status: 'ready', isSet: state.isSet })
      })
      .catch(() => {
        if (cancelled) return
        // Defensive: never block the gate on a probe failure.
        probedFor.current = sessionUserId
        setDecision({ status: 'ready', isSet: false })
      })
    return () => {
      cancelled = true
    }
  }, [sessionUserId])

  return { ...decision, status }
}
