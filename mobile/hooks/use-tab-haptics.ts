import { useMemo } from 'react'
import { triggerHaptic } from '@/lib/haptics'
import { publishTabPress } from '@/lib/tab-focus-pulse'

/**
 * Returns a `screenListeners` config for Expo Router's `<Tabs>` that:
 *  1. Fires a `selection` haptic on every tab press.
 *  2. Publishes a global "tab press" pulse so tab screens can play a
 *     subtle focus animation on switch — but not on stack-modal pop.
 *     The pulse carries the destination route so the receiving screen
 *     can compute direction (incoming from left vs right) and animate
 *     its content shift accordingly.
 */
export function useTabHaptics() {
  return useMemo(
    () => ({
      tabPress: (e: { target?: string }) => {
        void triggerHaptic('selection')
        // `target` is the navigator-prefixed route key (e.g.
        // "home-abc123") — we only care about the leading route name
        // up to the first hyphen. Falls back to undefined which keeps
        // the previous "to" intact.
        const target = e.target ?? ''
        const routeName = target.split('-')[0] || undefined
        publishTabPress(routeName)
      },
    }),
    [],
  )
}
