import { useCallback, useEffect, useRef } from 'react'

interface UseAuthBiometricAutoSignInParams {
  enabled: boolean
  onAttempt: () => Promise<void> | void
}

export function useAuthBiometricAutoSignIn({
  enabled,
  onAttempt,
}: UseAuthBiometricAutoSignInParams) {
  const hasAttemptedAutoBiometricRef = useRef(false)

  useEffect(() => {
    if (!enabled || hasAttemptedAutoBiometricRef.current) {
      return
    }

    hasAttemptedAutoBiometricRef.current = true
    void onAttempt()
  }, [enabled, onAttempt])

  const resetAutoBiometricAttempt = useCallback(() => {
    hasAttemptedAutoBiometricRef.current = false
  }, [])

  return {
    resetAutoBiometricAttempt,
  }
}
