import { useEffect, useMemo } from 'react'
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native'
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { FernLogo } from '@/components/auth/fern-logo'
import { RiseView } from '@/components/home/animated/rise-view'
import { useUnboundedLoopAnimation } from '@/hooks/use-unbounded-loop-animation'
import { decorativeDurations } from '@/lib/motion'
import { useReducedMotion } from '@/hooks/use-reduced-motion'
import { authTokens } from '@/theme/palette'

interface AuthLaunchSplashProps {
  onComplete?: () => void
  /** When true the splash never auto-hides; the parent controls visibility. */
  persistent?: boolean
  /** Optional override; otherwise read from system accessibility. */
  reducedMotion?: boolean
}

const HIDE_DELAY_MS = 2000
const EXIT_MS = 220

// Particle field cloned from the welcome screen so the splash uses the
// same drift pattern. Same indices, deltas and palette = identical
// distribution on screen → no visible jump on splash → welcome.
const PARTICLES = Array.from({ length: 8 }, (_, i) => ({
  key: i,
  leftPct: (i * 13 + 8) % 90,
  topPct: (i * 19 + 15) % 80,
  duration: 10000 + (i % 4) * 2000,
  delay: i * 700,
  color: i % 3 === 0 ? authTokens.peach : '#C7EE9C',
}))

/**
 * Launch-time splash. Visually identical to the welcome screen
 * (`mobile/screens/auth/welcome-screen.tsx`) — same dark welcomeBg,
 * same aurora blobs, same particle field, same hero stack (Fern 220 +
 * `Manifiesto.` wordmark + tagline) anchored at the bottom via
 * `justifyContent: 'flex-end'`. The CTA block is replaced with an
 * invisible spacer of the same dimensions, so the Fern and wordmark
 * land at the EXACT pixel coordinates of welcome's. When the splash
 * dismisses and welcome mounts, the brand mark appears to stay
 * still while the CTAs reveal in below — a real shared-element
 * transition rather than a crossfade.
 *
 * Public API preserved: `onComplete`, `persistent`, `reducedMotion`.
 */
export function AuthLaunchSplash({
  onComplete,
  persistent = false,
  reducedMotion,
}: AuthLaunchSplashProps) {
  const insets = useSafeAreaInsets()
  const { width, height } = useWindowDimensions()
  const systemReduced = useReducedMotion()
  const reduced = reducedMotion ?? systemReduced

  const overlayOpacity = useSharedValue(1)

  useEffect(() => {
    if (persistent) return
    let cancelled = false
    const timer = setTimeout(() => {
      if (cancelled) return
      overlayOpacity.value = withTiming(
        0,
        { duration: EXIT_MS, easing: Easing.out(Easing.cubic) },
        (finished) => {
          if (finished && onComplete) {
            runOnJS(onComplete)()
          }
        },
      )
    }, HIDE_DELAY_MS)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [onComplete, overlayOpacity, persistent])

  const overlayStyle = useAnimatedStyle(() => ({ opacity: overlayOpacity.value }))

  return (
    <Animated.View style={[styles.overlay, overlayStyle]} pointerEvents="auto">
      <View style={styles.root}>
        <AuroraLayer width={width} height={height} reduced={reduced} />
        <ParticleLayer width={width} height={height} reduced={reduced} />

        <View
          style={[
            styles.contentStack,
            { paddingTop: insets.top + 24, paddingBottom: 24 },
          ]}
        >
          <View style={styles.hero}>
            {/*
              Same optical-centring shift as welcome-screen.tsx so the
              splash → welcome handoff lands the Fern at identical
              pixel coordinates. See the welcome screen comment for
              the rationale (stem/pill is ~22pt left of geometric
              centre in the SVG).
            */}
            <View style={styles.logoOpticalAlign}>
              <FernLogo size={220} palette="light" animate={!reduced} delay={300} />
            </View>

            <RiseView delay={1100} duration={900} translateY={12}>
              <View style={styles.wordmarkRow}>
                <Text style={styles.wordmark}>Manifiesto</Text>
                <Text style={[styles.wordmark, styles.wordmarkDot]}>.</Text>
              </View>
            </RiseView>

            <RiseView delay={1300} duration={900} translateY={12}>
              <Text style={styles.tagline}>Finanzas para tu familia</Text>
            </RiseView>
          </View>

          {/*
            Invisible spacer that mirrors welcome's CTA block dimensions
            (primary 56 + 12 gap + secondary 52 + 22 gap + fineprint ~36
            + paddingTop 8 + paddingBottom max(insets.bottom + 12, 24)).
            Reserves the exact space the CTAs occupy on welcome so the
            hero above is at identical y coordinates on both screens.
          */}
          <View
            style={[
              styles.ctaReserve,
              { paddingBottom: Math.max(insets.bottom + 12, 24) },
            ]}
            pointerEvents="none"
            aria-hidden
          >
            <View style={styles.ctaReservePrimary} />
            <View style={styles.ctaReserveSecondary} />
            <View style={styles.ctaReserveFineprint} />
          </View>
        </View>
      </View>
    </Animated.View>
  )
}

// ─────────────────────────────────────────────────────────────
// Aurora — cloned from welcome-screen.tsx so the splash
// breathes identically and the transition stays visually stable.
// ─────────────────────────────────────────────────────────────
function AuroraLayer({
  width,
  height,
  reduced,
}: {
  width: number
  height: number
  reduced: boolean
}) {
  const t1 = useSharedValue(0)
  const t2 = useSharedValue(0)

  // useUnboundedLoopAnimation (NOT useLoopAnimation): the splash is
  // mounted as a sibling of the <Stack> in root-layout-shell.tsx —
  // it lives OUTSIDE the NavigationContainer. Using the focus-bound
  // variant here would call useIsFocused() from outside any screen
  // and short-circuit `start()` on native (returns false when there's
  // no NavigationContext), leaving the loops frozen. Web works because
  // React Navigation's web fallback defaults isFocused to true outside
  // screens — that asymmetry is precisely why this variant exists.
  useUnboundedLoopAnimation(
    () => {
      // The first blob breathes a touch faster (7000ms half-cycle ≈
      // 14000ms total ≈ 1.55x ambient) while the second uses the
      // canonical ambient cadence. Two slightly off-tempo loops give
      // a richer "alive" feel than two synced ones — keep the 7000
      // literal here on purpose.
      t1.value = withRepeat(
        withSequence(
          withTiming(1, { duration: 7000, easing: Easing.inOut(Easing.quad) }),
          withTiming(0, { duration: 7000, easing: Easing.inOut(Easing.quad) }),
        ),
        -1,
        false,
      )
      t2.value = withDelay(
        900,
        withRepeat(
          withSequence(
            withTiming(1, {
              duration: decorativeDurations.ambient,
              easing: Easing.inOut(Easing.quad),
            }),
            withTiming(0, {
              duration: decorativeDurations.ambient,
              easing: Easing.inOut(Easing.quad),
            }),
          ),
          -1,
          false,
        ),
      )
    },
    [t1, t2],
  )

  const blob1Style = useAnimatedStyle(() => ({
    transform: [
      { translateX: t1.value * 20 },
      { translateY: t1.value * 30 },
      { scale: 1 + t1.value * 0.15 },
    ],
  }))
  const blob2Style = useAnimatedStyle(() => ({
    transform: [
      { translateX: -t2.value * 25 },
      { translateY: -t2.value * 20 },
      { scale: 1 + t2.value * 0.1 },
    ],
  }))

  const blob1Size = 280
  const blob2Size = 300

  return (
    <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
      <Animated.View
        style={[
          styles.auroraBlob,
          {
            width: blob1Size,
            height: blob1Size,
            borderRadius: blob1Size / 2,
            top: -height * 0.1,
            left: -width * 0.15,
            backgroundColor: 'rgba(199,238,156,0.18)',
          },
          blob1Style,
        ]}
      />
      <Animated.View
        style={[
          styles.auroraBlob,
          {
            width: blob2Size,
            height: blob2Size,
            borderRadius: blob2Size / 2,
            bottom: height * 0.2,
            right: -width * 0.2,
            backgroundColor: 'rgba(242,181,138,0.16)',
          },
          blob2Style,
        ]}
      />
    </View>
  )
}

// ─────────────────────────────────────────────────────────────
// Particles — cloned from welcome-screen.tsx with identical
// indices/positions/colors so the field doesn't visibly jump
// when the splash hands off to welcome.
// ─────────────────────────────────────────────────────────────
function ParticleLayer({
  width,
  height,
  reduced,
}: {
  width: number
  height: number
  reduced: boolean
}) {
  const particles = useMemo(
    () =>
      PARTICLES.map((p) => ({
        ...p,
        left: (p.leftPct / 100) * width,
        top: (p.topPct / 100) * height,
      })),
    [width, height],
  )

  if (reduced) {
    return (
      <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
        {particles.map((p) => (
          <View
            key={p.key}
            style={[
              styles.particle,
              {
                left: p.left,
                top: p.top,
                backgroundColor: p.color,
                opacity: 0.4,
              },
            ]}
          />
        ))}
      </View>
    )
  }

  return (
    <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
      {particles.map((p) => (
        <Particle
          key={p.key}
          left={p.left}
          top={p.top}
          color={p.color}
          duration={p.duration}
          delay={p.delay}
        />
      ))}
    </View>
  )
}

function Particle({
  left,
  top,
  color,
  duration,
  delay,
}: {
  left: number
  top: number
  color: string
  duration: number
  delay: number
}) {
  const t = useSharedValue(0)

  // useUnboundedLoopAnimation: this Particle renders inside the splash
  // tree, which is outside the NavigationContainer (see comment on the
  // BackgroundBlobs hook above for the full reasoning).
  useUnboundedLoopAnimation(
    () => {
      t.value = withDelay(
        delay,
        withRepeat(
          withSequence(
            withTiming(1, {
              duration: duration / 2,
              easing: Easing.inOut(Easing.quad),
            }),
            withTiming(0, {
              duration: duration / 2,
              easing: Easing.inOut(Easing.quad),
            }),
          ),
          -1,
          false,
        ),
      )
    },
    [t],
    [duration, delay],
  )

  const style = useAnimatedStyle(() => ({
    transform: [
      { translateY: -30 * t.value },
      { translateX: 10 * t.value },
    ],
    opacity: 0.3 + t.value * 0.4,
  }))

  return (
    <Animated.View
      style={[
        styles.particle,
        { left, top, backgroundColor: color },
        style,
      ]}
    />
  )
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 20,
  },
  root: {
    flex: 1,
    backgroundColor: authTokens.welcomeBg,
    overflow: 'hidden',
  },
  // ↓↓↓ Layout values mirror welcome-screen.tsx exactly. Any change
  // here must also be reflected there to keep the shared-element
  // transition pixel-aligned.
  contentStack: {
    flex: 1,
    paddingHorizontal: 28,
    zIndex: 2,
  },
  hero: {
    flex: 1,
    alignItems: 'center',
    // Mirror welcome-screen.tsx exactly. paddingTop pushes the Fern
    // logo toward the actual screen middle (not just the middle of
    // the area above the CTA reserve), so the brand mark feels
    // anchored at the centre with the wordmark as its caption.
    justifyContent: 'center',
    paddingTop: 120,
  },
  logoOpticalAlign: {
    transform: [{ translateX: 22 }],
  },
  wordmarkRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginTop: 24,
  },
  wordmark: {
    fontSize: 46,
    fontWeight: '800',
    letterSpacing: -2,
    color: '#FFFBF2',
  },
  wordmarkDot: {
    color: authTokens.peach,
  },
  tagline: {
    marginTop: 10,
    fontSize: 15,
    fontWeight: '400',
    letterSpacing: -0.2,
    color: 'rgba(255,251,242,0.55)',
    textAlign: 'center',
  },
  // CTA reserve — invisible placeholders matching welcome's CTA block.
  ctaReserve: {
    paddingTop: 8,
  },
  ctaReservePrimary: {
    width: '100%',
    height: 56,
    borderRadius: 18,
  },
  ctaReserveSecondary: {
    width: '100%',
    height: 52,
    marginTop: 12,
    borderRadius: 18,
  },
  ctaReserveFineprint: {
    marginTop: 22,
    height: 14,
  },
  auroraBlob: {
    position: 'absolute',
  },
  particle: {
    position: 'absolute',
    width: 3,
    height: 3,
    borderRadius: 1.5,
  },
})
