import type { ScrollView } from 'react-native'
import type { TourKey } from './tour-keys'

/**
 * Module-level registry that lets each screen advertise its
 * ScrollView ref so the guided tour can auto-scroll to a step's
 * target before animating the highlight onto it.
 *
 * `react-native-copilot` already supports auto-scroll natively —
 * it just needs the `ScrollView` instance passed to `start()`. The
 * lib then does `measureLayout` against the scroll node and calls
 * `scrollTo` (with a 100ms buffer before animating the highlight)
 * on every step change. No manual scroll math needed.
 *
 * The registry is a plain Map rather than a React context because
 * the consumer (`useScreenTour`) lives in the same screen that
 * registers the ref — context would either need to be hoisted to
 * a parent we don't control, or duplicated per screen.
 */
const registry = new Map<TourKey, ScrollView | null | undefined>()

export function registerTourScrollView(
  tour: TourKey,
  scrollView: ScrollView | null | undefined,
): void {
  registry.set(tour, scrollView)
}

export function unregisterTourScrollView(tour: TourKey): void {
  registry.delete(tour)
}

export function getTourScrollView(tour: TourKey): ScrollView | null {
  return registry.get(tour) ?? null
}
