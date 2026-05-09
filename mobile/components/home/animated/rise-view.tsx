import { useMemo } from 'react'
import { Platform, View, type ViewStyle } from 'react-native'
import Animated, { Keyframe, ReduceMotion } from 'react-native-reanimated'

interface RiseViewProps {
  delay?: number
  duration?: number
  translateY?: number
  style?: ViewStyle
  children: React.ReactNode
}

/**
 * Staggered fade-in + rise primitive used across the app for content
 * entrances (logo splash, dashboard cards, list sections, etc.).
 *
 * Why a Keyframe entering animation, not useSharedValue + useEffect
 * -----------------------------------------------------------------
 * The previous implementation ran a manual `withTiming` inside a
 * `useEffect` after applying initial values via `useSharedValue`.
 * That pattern works correctly on web (CSS animations resolve the
 * initial style on first paint) but caused a one-frame flash on
 * native: the View paints with its default style first (no transform,
 * opacity 1 → visible at final position), THEN Reanimated mounts the
 * worklet style and snaps to the start state, THEN the effect fires
 * withTiming and animates back. User-visible result: a "placeholder"
 * of the final state appears for ~16ms before the entrance plays.
 *
 * Reanimated layout animations (`entering={...}`) are applied by the
 * native layout coordinator BEFORE the first paint, so the start
 * state is honored synchronously — no flash. Keyframe lets us
 * combine opacity + translateY in one declarative animation, with
 * `translateY` as a runtime prop (so different RiseViews can rise
 * from different distances).
 *
 * Web caveat:
 *   En web Reanimated v4 layout animations (entering Keyframe) tienen
 *   soporte parcial. El initial state {opacity: 0, translateY: N} no
 *   se aplica antes del primer paint con la misma garantía que en
 *   native (que usa el native layout coordinator). El View arranca
 *   visible en el estado FINAL, después aparece a opacity 0+translateY
 *   N un frame después, y después anima → flash visual + el layout
 *   PUEDE pasarle altura cero brevemente a los siblings → cualquier
 *   elemento ARRIBA del RiseView en un flex stack se ve "saltando".
 *   En welcome screen el FernLogo arriba de 3 RiseViews (wordmark,
 *   tagline, ctaBlock) recibía esa cascada de saltos.
 *
 *   En web saltamos el entering animation y rendereamos al estado
 *   final inmediato — un <View> normal sin Animated.View. La pérdida
 *   visual (sin fade-in stagger) es preferible al jitter de layout.
 *   Native sigue usando el Keyframe, sin cambio.
 */
export function RiseView({
  delay = 0,
  duration = 700,
  translateY = 14,
  style,
  children,
}: RiseViewProps) {
  const entering = useMemo(
    () =>
      new Keyframe({
        0: { opacity: 0, transform: [{ translateY }] },
        100: { opacity: 1, transform: [{ translateY: 0 }] },
      })
        .duration(duration)
        .delay(delay)
        // ReduceMotion.System: when the OS setting is on, the entrance
        // is skipped and the View renders at its final state directly.
        .reduceMotion(ReduceMotion.System),
    [duration, delay, translateY],
  )

  // En web: View normal sin entering animation (ver Web caveat arriba).
  if (Platform.OS === 'web') {
    return <View style={style}>{children}</View>
  }

  return (
    <Animated.View entering={entering} style={style}>
      {children}
    </Animated.View>
  )
}
