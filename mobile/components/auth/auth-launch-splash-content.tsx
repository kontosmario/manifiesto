import { useMemo } from 'react'
import { Image, StyleSheet, Text, View } from 'react-native'
import Animated, {
  Easing,
  FadeIn,
  Keyframe,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated'
import { BreatheDot } from '@/components/home/animated/breathe-dot'
import { RiseView } from '@/components/home/animated/rise-view'
import { useUnboundedLoopAnimation } from '@/hooks/use-unbounded-loop-animation'
import { decorativeDurations } from '@/lib/motion'
import { useReducedMotion } from '@/hooks/use-reduced-motion'
import { useAppTheme } from '@/theme/theme-provider'

// eslint-disable-next-line @typescript-eslint/no-require-imports
const brandLogo = require('../../../assets/brand/manifiesto-logo.png') as number

interface AuthLaunchSplashContentProps {
  showWhisper?: boolean
}

/**
 * Splash content stack: brand mark, eyebrow + title, subtitle, shimmer
 * progress bar. Mirrors the visual rhythm of the home/gastos hero cards
 * — staggered RiseView entrance, BreatheDot accent, low-key motion.
 */
export function AuthLaunchSplashContent({ showWhisper = true }: AuthLaunchSplashContentProps) {
  const { theme } = useAppTheme()
  const reduced = useReducedMotion()

  // Brand mark breath: subtle 2-3% scale loop. We use the unbounded
  // variant because this content renders inside the splash overlay
  // which is mounted OUTSIDE the NavigationContainer (sibling of the
  // <Stack> in root-layout-shell.tsx). The focus-bound
  // `useLoopAnimation` would short-circuit on native (no nav context
  // → useIsFocused returns false → loops never start). On web the
  // same code "just works" because React Navigation's web fallback
  // defaults isFocused to true outside screens.
  const breath = useSharedValue(1)
  useUnboundedLoopAnimation(
    () => {
      // 2800ms full breath cycle = decorativeDurations.breath.
      const halfCycle = decorativeDurations.breath / 2
      breath.value = withDelay(
        700,
        withRepeat(
          withSequence(
            withTiming(1.025, { duration: halfCycle, easing: Easing.inOut(Easing.quad) }),
            withTiming(1, { duration: halfCycle, easing: Easing.inOut(Easing.quad) }),
          ),
          -1,
          false,
        ),
      )
    },
    [breath],
  )
  const breathStyle = useAnimatedStyle(() => ({ transform: [{ scale: breath.value }] }))

  // Shimmer progress bar entrance: scaleX 0 → 1 over 2000ms, delayed
  // 360ms after mount. Uses a Keyframe `entering` animation so the
  // first paint already has the start state (scaleX 0) — the previous
  // useEffect-based pattern flashed the bar at full width for 1
  // frame before snapping to 0 and animating, on native only.
  const progressEntering = useMemo(
    () =>
      new Keyframe({
        0: { transform: [{ scaleX: 0 }] },
        100: { transform: [{ scaleX: 1 }] },
      })
        .duration(2000)
        .delay(360)
        .reduceMotion(ReduceMotion.System),
    [],
  )

  // Whisper line fades in after the bar lands. Same first-frame flash
  // story — replaced manual useSharedValue + useEffect with a built-in
  // FadeIn entering, applied before first paint.
  const whisperEntering = useMemo(
    () =>
      FadeIn.duration(360).delay(2200).reduceMotion(ReduceMotion.System),
    [],
  )

  return (
    <View style={styles.content} pointerEvents="none">
      <RiseView delay={0} duration={620} translateY={18}>
        <Animated.View style={[styles.brandMarkWrapper, breathStyle]}>
          <Image
            source={brandLogo}
            resizeMode="contain"
            style={styles.brandMark}
          />
        </Animated.View>
      </RiseView>

      <RiseView delay={120} duration={600}>
        <View style={styles.eyebrowRow}>
          <BreatheDot
            size={6}
            color={theme.colors.heroAccent}
            glow={theme.colors.heroAccent}
            periodMs={2400}
          />
          <Text style={[styles.eyebrow, { color: theme.colors.heroAccent }]}>
            MANIFIESTO
          </Text>
        </View>
      </RiseView>

      <RiseView delay={200} duration={620}>
        <Text style={[styles.title, { color: theme.colors.heroText }]}>
          Manifiesto
        </Text>
      </RiseView>

      <RiseView delay={280} duration={620}>
        <Text style={[styles.subtitle, { color: theme.colors.heroMuted2 }]}>
          Finanzas claras,{'\n'}todos los días.
        </Text>
      </RiseView>

      <RiseView delay={360} duration={520}>
        <View
          style={[
            styles.progressTrack,
            { backgroundColor: 'rgba(199,238,156,0.18)' },
          ]}
        >
          <Animated.View
            entering={progressEntering}
            style={[
              styles.progressFill,
              { backgroundColor: theme.colors.heroAccent },
            ]}
          />
        </View>
      </RiseView>

      {showWhisper ? (
        <Animated.Text
          entering={whisperEntering}
          style={[styles.whisper, { color: theme.colors.heroMuted2 }]}
        >
          Cargando tu espacio…
        </Animated.Text>
      ) : null}
    </View>
  )
}

const PROGRESS_WIDTH = 220

const styles = StyleSheet.create({
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingHorizontal: 28,
  },
  brandMarkWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 28,
  },
  brandMark: {
    width: 120,
    height: 120,
  },
  eyebrowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
    alignSelf: 'center',
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 2.4,
  },
  title: {
    fontSize: 46,
    lineHeight: 50,
    fontWeight: '900',
    letterSpacing: -1,
    textAlign: 'center',
  },
  subtitle: {
    marginTop: 12,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '500',
    textAlign: 'center',
    maxWidth: 280,
  },
  progressTrack: {
    marginTop: 28,
    width: PROGRESS_WIDTH,
    height: 3,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    width: '100%',
    height: '100%',
    borderRadius: 2,
    transformOrigin: 'left center',
  },
  whisper: {
    marginTop: 14,
    fontSize: 12,
    fontWeight: '500',
    letterSpacing: 0.2,
    textAlign: 'center',
  },
})
