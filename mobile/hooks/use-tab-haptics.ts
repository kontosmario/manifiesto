import { useMemo } from 'react'
import { triggerHaptic } from '@/lib/haptics'

/**
 * Returns a `screenListeners` config for Expo Router's `<Tabs>` that fires
 * `selection` haptic on every tab press. Wire into `<Tabs screenListeners={...}>`.
 */
export function useTabHaptics() {
  return useMemo(
    () => ({
      tabPress: () => {
        void triggerHaptic('selection')
      },
    }),
    [],
  )
}
