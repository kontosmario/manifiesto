import { useEffect, type PropsWithChildren } from 'react'
import { StyleSheet, View, type LayoutChangeEvent, type ViewStyle } from 'react-native'
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated'
import { useControlAnchors } from '@/features/insights/control-section-anchors'
import type { ControlSectionAnchor } from '@/features/insights/control-action'
import { motionDurations, motionEasings } from '@/lib/motion/tokens'
import { withAlpha } from '@/theme/color-utils'
import { neoRadii, neoTokens } from '@/theme/neo-tokens'
import { useThemeMode } from '@/theme/theme-provider'

interface ControlV2AnchorProps extends PropsWithChildren {
  section: ControlSectionAnchor
  style?: ViewStyle
  /** false = solo el pulso, sin registrar offset. El y de onLayout es
   *  RELATIVO AL PADRE: anidado dentro de un TourTarget mide ~0 y
   *  rompería el scroll-to-section — la pantalla neo registra el offset
   *  en su wrapper de sección (hijo directo del stack) y apaga este
   *  registro. Default true = comportamiento histórico. */
  register?: boolean
}

/**
 * Wraps a Control section so it:
 *   1. Registers its vertical offset in the anchor context on layout.
 *   2. Pulses a subtle scale + glow when the dispatcher targets it
 *      (via `ControlAction: { kind: 'scroll-to-section' }`).
 *
 * The pulse lives for ~900ms then fades, so the user gets a clear
 * "landed here" cue after the scroll completes without needing to
 * hunt for which block the Asistente pointed to.
 */
export function ControlV2Anchor({
  section,
  style,
  children,
  register = true,
}: ControlV2AnchorProps) {
  const { registerOffset, pulsingSection } = useControlAnchors()
  const { resolvedMode } = useThemeMode()
  const neo = neoTokens(resolvedMode)
  const pulse = useSharedValue(0)

  useEffect(() => {
    if (pulsingSection !== section) return
    pulse.value = 0
    pulse.value = withSequence(
      withTiming(1, { duration: motionDurations.exitModal, easing: motionEasings.decelerate }),
      withRepeat(
        withSequence(
          withTiming(0.3, { duration: motionDurations.scrimIn, easing: Easing.inOut(Easing.sin) }),
          withTiming(0.9, { duration: motionDurations.scrimIn, easing: Easing.inOut(Easing.sin) }),
        ),
        2,
        false,
      ),
      withTiming(0, { duration: motionDurations.standard, easing: motionEasings.exitStandard }),
    )
    // The pulse is bounded (~1s total), but if the user navigates
    // away mid-pulse the worklet driver should be torn down to free
    // the UI runtime allocation.
    return () => {
      cancelAnimation(pulse)
    }
  }, [pulsingSection, section, pulse])

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + 0.008 * pulse.value }],
  }))

  // `boxShadow` es un string y Reanimated no lo interpola, así que el halo
  // vive en una capa propia cuya OPACIDAD sí se anima — mismo recurso que el
  // `warnRing` de `freq-tile` / `AmountCard`. La capa va detrás de los hijos
  // y sin fill: lo único que pinta es la sombra que desborda su caja.
  const glowStyle = useAnimatedStyle(() => ({ opacity: pulse.value }))

  const handleLayout = (event: LayoutChangeEvent) => {
    // `y` here is relative to the parent — the screen passes down a
    // ScrollView whose root View shares coords, so this is the offset
    // the ScrollView can seek to.
    if (register) registerOffset(section, event.nativeEvent.layout.y)
  }

  // El halo es mode-aware por contraste, no por gusto: en oscuro el verde
  // claro despega del canvas de bosque; en claro el mismo verde sobre la
  // salvia es casi imperceptible y hay que ir al verde de acción.
  const glowColor = withAlpha(resolvedMode === 'dark' ? neo.green : neo.greenDeep, 0.45)

  return (
    <View onLayout={handleLayout} style={style}>
      <Animated.View style={animatedStyle}>
        <Animated.View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill,
            styles.glow,
            { boxShadow: `0 0 20px 2px ${glowColor}` },
            glowStyle,
          ]}
        />
        {children}
      </Animated.View>
    </View>
  )
}

const styles = StyleSheet.create({
  glow: {
    borderRadius: neoRadii.card,
  },
})
