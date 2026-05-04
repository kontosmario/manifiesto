import {
  useCallback,
  useEffect,
  useRef,
  type RefObject,
} from 'react'
import type {
  NativeScrollEvent,
  NativeSyntheticEvent,
  View,
} from 'react-native'
import {
  registerTourScrollEntry,
  unregisterTourScrollEntry,
} from './tour-scroll-registry'
import type { TourKey } from './tour-keys'

/**
 * Structural type accepted by the hook. We don't try to type the
 * resolved scroll node strictly — RN's `ScrollView.getScrollResponder()`
 * returns `ScrollResponderMixin` (not the same shape as a ScrollView),
 * and `SectionList`/`FlatList` refs return a ScrollView component.
 * The closures inside the hook resolve fresh on every call and
 * fall back gracefully if anything is unavailable.
 */
type ScrollableHandle =
  | { getScrollResponder: () => unknown }
  | { measureInWindow: unknown; scrollTo: unknown }

interface UseRegisterTourScrollViewResult {
  /**
   * Wire this onto the screen's `<Screen onScroll={...}
   * scrollEventThrottle={16}>` so the registry can compute the
   * absolute scroll target for each step.
   *
   * The handler is stable across renders — safe to spread directly.
   */
  onScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => void
  /**
   * Wire this onto the screen's `<Screen onContentSizeChange={...}>`
   * (or directly onto the inner ScrollView if the screen owns one).
   * The host uses the tracked content height to clamp `targetScrollY`
   * to the actual `maxScrollY`, so requesting a scroll past the
   * content's end no longer leaves the cutout's computed post-scroll
   * position out of sync with the silently-clamped real position.
   */
  onContentSizeChange: (width: number, height: number) => void
}

interface ResolvedMeasureNode {
  measureInWindow: (
    cb: (x: number, y: number, w: number, h: number) => void,
  ) => void
}

interface ResolvedScrollFn {
  (opts: { y: number; animated?: boolean }): void
}

/**
 * Returns a node that can be measured in window coordinates.
 *
 * Priority order:
 *   1. The optional `measureRef` (typically a `<View collapsable=
 *      {false}>` wrapping the scrollable area). This is the most
 *      reliable path for `SectionList`/`FlatList` because the list
 *      instance itself doesn't expose `measureInWindow`, and reaching
 *      into `getScrollResponder()` is fragile across RN versions
 *      (sometimes returns the `ScrollResponderMixin` method bag,
 *      sometimes returns null until the inner ScrollView mounts).
 *   2. The scroll ref's `measureInWindow` directly (works for raw
 *      `ScrollView` refs).
 *   3. The scroll ref's responder via `getScrollResponder()` if it
 *      happens to be measurable.
 */
function resolveMeasureNode(
  scrollRef: RefObject<ScrollableHandle | null>,
  measureRef: RefObject<View | null> | undefined,
): ResolvedMeasureNode | null {
  const wrapper = measureRef?.current as
    | { measureInWindow?: ResolvedMeasureNode['measureInWindow'] }
    | null
    | undefined
  if (wrapper && typeof wrapper.measureInWindow === 'function') {
    return wrapper as ResolvedMeasureNode
  }
  const raw = scrollRef.current as
    | (ResolvedMeasureNode & { getScrollResponder?: () => unknown })
    | null
  if (!raw) return null
  if (typeof raw.measureInWindow === 'function') {
    return raw
  }
  if (typeof raw.getScrollResponder === 'function') {
    const responder = raw.getScrollResponder() as ResolvedMeasureNode | null
    if (responder && typeof responder.measureInWindow === 'function') {
      return responder
    }
  }
  return null
}

/**
 * Returns a function that scrolls the surface to a Y offset.
 *
 * Priority order:
 *   1. `scrollTo` directly on the ref (raw `ScrollView`).
 *   2. `scrollToOffset` (FlatList/SectionList — both expose this via
 *      VirtualizedList; it accepts a pixel offset just like
 *      `scrollTo({ y })`).
 *   3. `scrollTo` reached through `getScrollResponder()` as a last
 *      resort.
 */
function resolveScrollFn(
  scrollRef: RefObject<ScrollableHandle | null>,
): ResolvedScrollFn | null {
  const raw = scrollRef.current as
    | {
        scrollTo?: ResolvedScrollFn
        scrollToOffset?: (opts: { offset: number; animated?: boolean }) => void
        getScrollResponder?: () => unknown
      }
    | null
  if (!raw) return null
  if (typeof raw.scrollTo === 'function') {
    return raw.scrollTo.bind(raw)
  }
  if (typeof raw.scrollToOffset === 'function') {
    const fn = raw.scrollToOffset.bind(raw)
    return ({ y, animated }) => fn({ offset: y, animated })
  }
  if (typeof raw.getScrollResponder === 'function') {
    const responder = raw.getScrollResponder() as
      | { scrollTo?: ResolvedScrollFn }
      | null
    if (responder && typeof responder.scrollTo === 'function') {
      return responder.scrollTo.bind(responder)
    }
  }
  return null
}

interface UseRegisterTourScrollViewOptions {
  /**
   * Optional View ref used for measuring the scroll surface. Required
   * when the scroll surface is a `SectionList` / `FlatList`, since
   * those instances don't expose `measureInWindow` reliably across RN
   * versions. Wire it to a `<View collapsable={false}>` whose layout
   * matches the scroll surface (e.g. the `flex: 1` parent that
   * already wraps the list).
   */
  measureRef?: RefObject<View | null>
}

/**
 * Wires a screen's ScrollView (or SectionList/FlatList) into the
 * tour registry so the guided tour can auto-scroll each step's
 * target into view.
 *
 * The hook owns the live scroll-Y tracking ref and returns
 * `onScroll` + `onContentSizeChange` handlers the screen must wire
 * onto its scroll surface.
 */
export function useRegisterTourScrollView(
  tour: TourKey,
  scrollRef: RefObject<ScrollableHandle | null>,
  options?: UseRegisterTourScrollViewOptions,
): UseRegisterTourScrollViewResult {
  const scrollYRef = useRef(0)
  const contentHeightRef = useRef(0)
  const measureRef = options?.measureRef

  useEffect(() => {
    registerTourScrollEntry(tour, {
      measureSv: (cb) => {
        const node = resolveMeasureNode(scrollRef, measureRef)
        if (!node) {
          cb(null)
          return
        }
        node.measureInWindow((x, y, w, h) =>
          cb({ x, y, width: w, height: h }),
        )
      },
      scrollSvTo: (y, animated) => {
        const fn = resolveScrollFn(scrollRef)
        fn?.({ y, animated })
      },
      scrollYRef,
      contentHeightRef,
    })
    return () => {
      unregisterTourScrollEntry(tour)
    }
  }, [tour, scrollRef, measureRef])

  const onScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      scrollYRef.current = event.nativeEvent.contentOffset.y
    },
    [],
  )

  const onContentSizeChange = useCallback((_width: number, height: number) => {
    contentHeightRef.current = height
  }, [])

  return { onScroll, onContentSizeChange }
}
