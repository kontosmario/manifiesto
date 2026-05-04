import {
  useCallback,
  useEffect,
  useRef,
  type RefObject,
} from 'react'
import type {
  NativeScrollEvent,
  NativeSyntheticEvent,
  ScrollView,
} from 'react-native'
import {
  registerTourScrollEntry,
  unregisterTourScrollEntry,
} from './tour-scroll-registry'
import type { TourKey } from './tour-keys'

interface UseRegisterTourScrollViewResult {
  /**
   * Wire this onto the screen's `<Screen onScroll={...}
   * scrollEventThrottle={16}>` so the registry can compute the
   * absolute scroll target for each step.
   *
   * The handler is stable across renders — safe to spread directly.
   */
  onScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => void
}

/**
 * Wires a screen's ScrollView into the tour registry so the guided
 * tour can auto-scroll each step's target into view.
 *
 * The hook owns the live scroll-Y tracking ref and returns an
 * `onScroll` handler the screen must spread onto its `<Screen>`. If
 * the screen already has its own onScroll handler (e.g. for
 * sticky-header reveal), call both.
 */
export function useRegisterTourScrollView(
  tour: TourKey,
  scrollRef: RefObject<ScrollView | null>,
): UseRegisterTourScrollViewResult {
  const scrollYRef = useRef(0)

  useEffect(() => {
    registerTourScrollEntry(tour, {
      scrollView: scrollRef.current,
      scrollYRef,
    })
    return () => {
      unregisterTourScrollEntry(tour)
    }
  }, [tour, scrollRef])

  const onScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      scrollYRef.current = event.nativeEvent.contentOffset.y
    },
    [],
  )

  return { onScroll }
}
