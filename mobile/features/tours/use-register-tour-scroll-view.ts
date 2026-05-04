import { useEffect, type RefObject } from 'react'
import type { ScrollView } from 'react-native'
import {
  registerTourScrollView,
  unregisterTourScrollView,
} from './tour-scroll-registry'
import type { TourKey } from './tour-keys'

/**
 * Wires a screen's ScrollView ref into the tour registry so the
 * guided tour can auto-scroll each step's target into view. Pair
 * this with passing the same ref to the screen's `<Screen scrollRef
 * ... />` (the screen primitive forwards refs to its inner
 * ScrollView).
 *
 * Re-registers whenever the ref or tour key changes; unregisters
 * on unmount so a stale ref from a previous mount can't be used.
 */
export function useRegisterTourScrollView(
  tour: TourKey,
  scrollRef: RefObject<ScrollView | null>,
): void {
  useEffect(() => {
    registerTourScrollView(tour, scrollRef.current)
    return () => {
      unregisterTourScrollView(tour)
    }
  }, [tour, scrollRef])
}
