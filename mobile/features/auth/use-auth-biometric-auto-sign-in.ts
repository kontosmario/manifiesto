import { useCallback } from 'react'

interface UseAuthBiometricAutoSignInParams {
  enabled: boolean
  onAttempt: () => Promise<void> | void
}

// Auto-attempt is intentionally disabled: Face ID must run only when
// the user taps the explicit CTA on the login hero. Auto-firing on
// mount caused a duplicate native prompt (auto + tap) and made the
// "Entrar con Face ID" button feel out of sync with the actual scan.
// The reset callback is kept as a no-op for back-compat with the
// controller's `useFocusEffect`.
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- params kept for back-compat with caller signature
export function useAuthBiometricAutoSignIn(_params: UseAuthBiometricAutoSignInParams) {
  const resetAutoBiometricAttempt = useCallback(() => {}, [])

  return {
    resetAutoBiometricAttempt,
  }
}
