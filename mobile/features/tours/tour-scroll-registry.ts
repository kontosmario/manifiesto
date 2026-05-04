import type { MutableRefObject } from 'react'
import type { TourKey } from './tour-keys'

export interface MeasuredRect {
  x: number
  y: number
  width: number
  height: number
}

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
  /**
   * Measure the scrollable surface in window coordinates. Returns
   * `null` if the underlying node isn't ready yet (relevant for
   * `SectionList`/`FlatList`, whose internal ScrollView responder is
   * not always attached the instant our parent's useEffect runs).
   *
   * Stored as a closure so resolution happens lazily on every call.
   * This is safer than caching the resolved node at registration
   * time, which left dangling references when the inner ScrollView
   * mounted late or when `getScrollResponder()` returned the
   * `ScrollResponderMixin` method bag (no `measureInWindow`) instead
   * of a class instance.
   */
  measureSv: (cb: (rect: MeasuredRect | null) => void) => void
  /**
   * Imperatively scroll the surface to a Y offset (in content
   * coordinates). No-ops if the underlying node isn't ready or
   * doesn't expose `scrollTo`.
   */
  scrollSvTo: (y: number, animated: boolean) => void
  scrollYRef: MutableRefObject<number>
  /**
   * Total height of the scrollable content. Updated via the
   * ScrollView's `onContentSizeChange`. Used by the tour host to
   * clamp `targetScrollY` to the actual `maxScrollY = contentHeight
   * − viewport height` — without this, requesting a scroll past
   * the content's end appeared to succeed (the call returns void)
   * but the ScrollView silently clamped, leaving the cutout's
   * computed post-scroll position out of sync with reality.
   */
  contentHeightRef: MutableRefObject<number>
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
