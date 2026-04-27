import { useMemo } from 'react'
import { triggerHaptic } from '@/lib/haptics'
import { publishTabPress } from '@/lib/tab-focus-pulse'

/**
 * Returns a `screenListeners` config for Expo Router's `<Tabs>` that:
 *  1. Fires a `selection` haptic on every tab press.
 *  2. Publishes a global "tab press" pulse so tab screens can play a
 *     subtle focus animation on switch — but not on stack-modal pop.
 */
export function useTabHaptics() {
  return useMemo(
    () => ({
      tabPress: () => {
        void triggerHaptic('selection')
        publishTabPress()
      },
    }),
    [],
  )
}
