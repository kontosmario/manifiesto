// Sprint R-3 · R-3.3 — React hook that wires the pure decision
// (`shouldShowProtectionPrompt`) to async SecureStore state and
// AppState transitions.
//
// Re-reads the dismissal stamp when AppState flips to 'active' so a
// user who dismissed yesterday and re-opens the app today sees the
// banner again without a manual reload (the 24h boundary may cross
// while the app is backgrounded).

import { useCallback, useEffect, useState } from 'react'
import { AppState } from 'react-native'
import {
  recordProtectionPromptDismissal,
  readProtectionPromptDismissal,
} from './protection-prompt-dismissal'
import { shouldShowProtectionPrompt } from './should-show-protection-prompt'

interface UseProtectionPromptInput {
  userId: string | null | undefined
  hasSession: boolean
  hasBiometricCredentials: boolean
  pinIsSet: boolean
  onboardingCompleted: boolean
}

export interface UseProtectionPromptResult {
  visible: boolean
  dismiss: () => Promise<void>
}

export function useProtectionPrompt(
  input: UseProtectionPromptInput,
): UseProtectionPromptResult {
  const [lastDismissedAt, setLastDismissedAt] = useState<number | null>(null)
  const [loaded, setLoaded] = useState(false)

  const userId = input.userId ?? null

  const refresh = useCallback(async () => {
    if (!userId) {
      setLastDismissedAt(null)
      setLoaded(true)
      return
    }
    const value = await readProtectionPromptDismissal(userId)
    setLastDismissedAt(value)
    setLoaded(true)
  }, [userId])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') void refresh()
    })
    return () => sub.remove()
  }, [refresh])

  const visible =
    loaded &&
    shouldShowProtectionPrompt({
      hasSession: input.hasSession,
      hasBiometricCredentials: input.hasBiometricCredentials,
      pinIsSet: input.pinIsSet,
      onboardingCompleted: input.onboardingCompleted,
      lastDismissedAt,
      now: Date.now(),
    })

  const dismiss = useCallback(async () => {
    if (!userId) return
    await recordProtectionPromptDismissal(userId)
    setLastDismissedAt(Date.now())
  }, [userId])

  return { visible, dismiss }
}
