import { Pressable, StyleSheet, View } from 'react-native'
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from 'react-native-reanimated'
import Svg, { Path } from 'react-native-svg'
import { TabSectionHeader } from '@/components/ui/tab-section-header'
import {
  CIRCLE_BUTTON_SHADOW,
  CIRCLE_BUTTON_SIZE,
  circleButtonSurface,
} from '@/components/ui/circle-button-chrome'
import { useLoopAnimation } from '@/hooks/use-loop-animation'
import { usePressScale } from '@/hooks/use-press-scale'
import { useAppTheme } from '@/theme/theme-provider'

interface FijosHeaderProps {
  title?: string
  subtitle?: string
  onPressAdd?: () => void
  /**
   * Optional ref attached to the add-button stage (the circular
   * Pressable + halo rings). Used by the Fijos guided tour to
   * highlight the add affordance as a tour step.
   */
  addButtonRef?: React.RefObject<View | null>
}

const BUTTON_SIZE = CIRCLE_BUTTON_SIZE

export function FijosHeader({
  title = 'Fijos',
  subtitle = 'Todo lo recurrente en un solo lugar',
  onPressAdd,
  addButtonRef,
}: FijosHeaderProps) {
  const { theme } = useAppTheme()

  // Two staggered halo rings ping outward — sonar style. Each ring
  // animates scale 1 → 1.55 + opacity 0.45 → 0 in 1800ms, with the
  // second ring delayed 900ms so the loop never has a quiet beat.
  // Way more polished than the previous scale-bounce on the button.
  const haloA = useSharedValue(0)
  const haloB = useSharedValue(0)

  // Continuous sonar — each wave expands at constant velocity (linear
  // easing) over 3.6s, then snaps back via withRepeat's reverse=false
  // so the cycle is "expand → instant reset → expand". Two halos
  // staggered by half a cycle keep the loop visually unbroken.
  // Linear matters: with an out-cubic curve the ring "hangs" near
  // peak for seconds and looks like the animation stopped.
  //
  // useLoopAnimation handles cancelAnimation on blur/unmount + the
  // reduced-motion fallback (parks both halos at 0).
  useLoopAnimation(
    () => {
      const loop = (sv: typeof haloA, delay = 0) => {
        sv.value = withDelay(
          delay,
          withRepeat(
            // @motion-allow: 3.6s linear sonar sweep; staggered by half-cycle (1800ms) for an unbroken halo loop
            withTiming(1, { duration: 3600, easing: Easing.linear }),
            -1,
            false,
          ),
        )
      }
      loop(haloA, 0)
      loop(haloB, 1800)
    },
    [haloA, haloB],
  )

  const haloStyleA = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + haloA.value * 0.32 }],
    opacity: 0.22 * (1 - haloA.value),
  }))
  const haloStyleB = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + haloB.value * 0.32 }],
    opacity: 0.22 * (1 - haloB.value),
  }))

  // Press scale Emil-grade — escala 0.94 más pronunciada para el
  // tap-target chico de 38pt + soft halo distractor. El opacity:0.92
  // anterior se diluía contra el halo sonar.
  const press = usePressScale({ pressedScale: 0.94 })

  return (
    <TabSectionHeader
      title={title}
      subtitle={subtitle}
      rightRef={addButtonRef}
      right={
        <View style={styles.addButtonStage}>
          <Animated.View
            pointerEvents="none"
            style={[
              styles.halo,
              { borderColor: theme.colors.primary },
              haloStyleA,
            ]}
          />
          <Animated.View
            pointerEvents="none"
            style={[
              styles.halo,
              { borderColor: theme.colors.primary },
              haloStyleB,
            ]}
          />

          <Pressable
            onPress={onPressAdd}
            onPressIn={press.onPressIn}
            onPressOut={press.onPressOut}
            accessibilityRole="button"
            accessibilityLabel="Agregar fijo"
          >
            <Animated.View
              style={[
                styles.addButton,
                {
                  // Shared circle chrome — identical surface + shadow to
                  // the Home / Gastos / Control header buttons so the +
                  // joins the one circular family.
                  backgroundColor: circleButtonSurface(theme.isDark, theme.colors),
                  boxShadow: CIRCLE_BUTTON_SHADOW,
                },
                press.animatedStyle,
              ]}
            >
              <PlusIcon color={theme.colors.primary} />
            </Animated.View>
          </Pressable>
        </View>
      }
    />
  )
}

// Same stroke language as the Home header's BellIcon / SlidersIcon —
// 1.8px stroke, round caps, no fill. Keeps the visual family tight.
const PlusIcon = ({ color }: { color: string }) => (
  <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
    <Path
      d="M12 5v14M5 12h14"
      stroke={color}
      strokeWidth={1.8}
      strokeLinecap="round"
    />
  </Svg>
)

const styles = StyleSheet.create({
  // Title/subtitle + row geometry now live in TabSectionHeader. The
  // stage only positions the halo rings around the 38px add button;
  // its top/left margin is provided by the shell's right slot.
  addButtonStage: {
    width: BUTTON_SIZE,
    height: BUTTON_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  halo: {
    position: 'absolute',
    width: BUTTON_SIZE,
    height: BUTTON_SIZE,
    borderRadius: 999,
    borderWidth: 1,
  },
  addButton: {
    width: BUTTON_SIZE,
    height: BUTTON_SIZE,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    // boxShadow theme-aware se aplica inline en el JSX (no acá) para
    // que dependa de theme.isDark — los styles estáticos no pueden.
  },
})
