import { useEffect, useState } from 'react'
import { motionDurations } from '@/lib/motion'

// Time we consider the native-stack push animation "done" + a small
// buffer so the first paint of the destination screen has time to
// commit. Anything heavier than a static View should defer past this.
const SETTLE_DELAY_MS = motionDurations.enterStack + 60

/**
 * Returns `false` for the first ~340ms after mount, then `true`.
 *
 * Use on stack/modal screens to gate work that would otherwise
 * contend with the native push animation: entrance Reanimated
 * worklets (`RiseView`, `FadeIn`), cold-start data fetches, heavy
 * useMemo chains, etc.
 *
 * Pair with `<RiseViewGate skip={!isSettled}>` to mute every
 * descendant `RiseView` during the transition window.
 */
export function useIsNavigationSettled() {
  const [isSettled, setIsSettled] = useState(false)
  useEffect(() => {
    const id = setTimeout(() => setIsSettled(true), SETTLE_DELAY_MS)
    return () => clearTimeout(id)
  }, [])
  return isSettled
}
