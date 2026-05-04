import { Pressable, StyleSheet, Text, View } from 'react-native'
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from 'react-native-reanimated'
import Svg, { Path } from 'react-native-svg'
import { RiseView } from '@/components/home/animated/rise-view'
import { useLoopAnimation } from '@/hooks/use-loop-animation'
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

const BUTTON_SIZE = 38

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

  return (
    <RiseView>
      <View style={styles.row}>
        <View style={styles.titleBlock}>
          <Text style={[styles.title, { color: theme.colors.text }]}>{title}</Text>
          {subtitle ? (
            <Text style={[styles.subtitle, { color: theme.colors.textMuted }]}>{subtitle}</Text>
          ) : null}
        </View>

        <View
          ref={addButtonRef}
          collapsable={false}
          style={styles.addButtonStage}
        >
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
            accessibilityRole="button"
            accessibilityLabel="Agregar fijo"
            style={({ pressed }) => [
              styles.addButton,
              {
                backgroundColor: theme.colors.creamCard,
                opacity: pressed ? 0.92 : 1,
              },
            ]}
          >
            <PlusIcon color={theme.colors.primary} />
          </Pressable>
        </View>
      </View>
    </RiseView>
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
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingTop: 2,
  },
  titleBlock: { flex: 1 },
  title: { fontSize: 34, fontWeight: '800', letterSpacing: -1.2, lineHeight: 34 },
  subtitle: { fontSize: 13, marginTop: 6, lineHeight: 18, maxWidth: 260 },
  addButtonStage: {
    width: BUTTON_SIZE,
    height: BUTTON_SIZE,
    marginTop: 14,
    marginLeft: 8,
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
    boxShadow: '0px 2px 6px rgba(15, 42, 30, 0.08)',
  },
})
