import type { MutableRefObject } from 'react'
import type { ScrollView } from 'react-native'
import type { TourKey } from './tour-keys'

/**
 * Module-level registry that pairs each screen's ScrollView ref
 * with a live scroll-Y tracker so the guided tour can auto-scroll
 * to a step's target before highlighting it.
 *
 * We do NOT use `react-native-copilot`'s built-in auto-scroll
 * (passing the ScrollView to `start()`) because the lib internally
 * calls `wrapperRef.current.measureLayout(findNodeHandle(scrollView),
 * ...)`. In RN 0.81+ on Fabric, `measureLayout` no longer accepts a
 * numeric node handle — it expects a ref to a host component — and
 * the lib's call triggers a runtime warning ("ref.measureLayout
 * must be called with a ref to a native component"). The auto-
 * scroll either silently fails or fires a deprecation warning per
 * step transition.
 *
 * Instead we run the scroll ourselves from `useScreenTour` using
 * the new-architecture-friendly `measureInWindow` API on both the
 * step's wrapper and the screen's ScrollView, plus a tracked
 * scroll-Y ref so we can compute the absolute target offset
 * without needing measureLayout at all.
 */
export interface TourScrollEntry {
  scrollView: ScrollView | null | undefined
  scrollYRef: MutableRefObject<number>
}

const registry = new Map<TourKey, TourScrollEntry>()

export function registerTourScrollEntry(
  tour: TourKey,
  entry: TourScrollEntry,
): void {
  registry.set(tour, entry)
}

export function unregisterTourScrollEntry(tour: TourKey): void {
  registry.delete(tour)
}

export function getTourScrollEntry(tour: TourKey): TourScrollEntry | null {
  return registry.get(tour) ?? null
}
