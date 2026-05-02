import { useEffect, useMemo } from 'react'
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native'
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Svg, { Path } from 'react-native-svg'
import {
  AuroraLayer,
  ParticleLayer,
} from '@/components/auth/auth-launch-splash'
import { FernLogo } from '@/components/auth/fern-logo'
import { RiseView } from '@/components/home/animated/rise-view'
import { useReducedMotion } from '@/hooks/use-reduced-motion'
import { markAuthTransitionLoaded } from '@/lib/auth-transition-splash'
import { authTokens } from '@/theme/palette'

interface WelcomeScreenProps {
  onCreate: () => void
  onLogin: () => void
}


/**
 * Welcome screen — the first thing an unauthenticated visitor sees in the
 * (auth) stack. Full-bleed dark green background with two breathing aurora
 * blobs and 8 drifting particle dots. Hero stack centered low: Fern logo,
 * "Manifiesto." wordmark with a peach period, tagline. Two CTAs at the
 * bottom (Empezar / Ya tengo cuenta) plus a fine-print footer.
 *
 * Animation budget:
 * - Fern logo: handled internally (`animate delay=300`).
 * - Wordmark / tagline / CTA block: RiseView staggered at 1100/1300/1500ms
 *   to match the design's `fade-in-up` keyframes.
 * - Aurora: 2 blobs translate+scale at 14s / 18s on a sine cycle.
 * - Particles: each translates Y on a 10–14s sine cycle.
 * All loops are disabled under `useReducedMotion`.
 */
export function WelcomeScreen({ onCreate, onLogin }: WelcomeScreenProps) {
  const insets = useSafeAreaInsets()
  const { width, height } = useWindowDimensions()
  const reduced = useReducedMotion()

  // This is a destination route reached after `router.replace` from
  // logout (and from the cold-start cascade when there's no session).
  // Hide the auth-transition splash on mount so the overlay fades out
  // and the user sees the CTAs underneath. Without this, the overlay
  // stays visible forever on the welcome screen because no guard
  // wraps this route to clear the flag.
  useEffect(() => {
    // Welcome rendered means we've reached a destination — let the
    // splash module decide whether to hide now (min visible elapsed)
    // or buffer until it does.
    markAuthTransitionLoaded()
  }, [])

  return (
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
            The Fern brand mark's stem + pill sit at viewBox x≈200,
            ~50 SVG units left of the geometric center (251). With the
            normal viewBox that translates to ~22pt of left-bias on a
            220pt logo, which makes the wordmark below appear off-axis.
            A small translateX on this wrapper nudges the rendered SVG
            right so the visual axis (stem) aligns with the wordmark.
          */}
          <View style={styles.logoOpticalAlign}>
            <FernLogo size={220} palette="light" animate delay={300} />
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

        <RiseView delay={1500} duration={900} translateY={12}>
          <View
            style={[
              styles.ctaBlock,
              { paddingBottom: Math.max(insets.bottom + 12, 24) },
            ]}
          >
            <PrimaryCta label="Empezar" onPress={onCreate} />
            <SecondaryCta label="Ya tengo cuenta" onPress={onLogin} />

            <Text style={styles.fineprint}>
              Al continuar aceptás los{' '}
              <Text style={styles.fineprintLink}>Términos</Text> y la{' '}
              <Text style={styles.fineprintLink}>Privacidad</Text>
            </Text>
          </View>
        </RiseView>
      </View>
    </View>
  )
}


// ─────────────────────────────────────────────────────────────
// CTAs
// ─────────────────────────────────────────────────────────────
function PrimaryCta({ label, onPress }: { label: string; onPress: () => void }) {
  const scale = useSharedValue(1)
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }))

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      onPressIn={() => {
        scale.value = withTiming(0.98, { duration: 120 })
      }}
      onPressOut={() => {
        scale.value = withTiming(1, { duration: 160 })
      }}
      hitSlop={8}
    >
      <Animated.View style={[styles.primaryCta, style]}>
        <Text style={styles.primaryCtaLabel}>{label}</Text>
        <View style={styles.primaryCtaArrow}>
          <Svg width={16} height={16} viewBox="0 0 16 16" fill="none">
            <Path
              d="M5 3l5 5-5 5"
              stroke={authTokens.welcomeBg}
              strokeWidth={2.2}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </Svg>
        </View>
      </Animated.View>
    </Pressable>
  )
}

function SecondaryCta({
  label,
  onPress,
}: {
  label: string
  onPress: () => void
}) {
  const opacity = useSharedValue(1)
  const style = useAnimatedStyle(() => ({ opacity: opacity.value }))

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      onPressIn={() => {
        opacity.value = withTiming(0.6, { duration: 120 })
      }}
      onPressOut={() => {
        opacity.value = withTiming(1, { duration: 160 })
      }}
      hitSlop={8}
    >
      <Animated.View style={[styles.secondaryCta, style]}>
        <Text style={styles.secondaryCtaLabel}>{label}</Text>
      </Animated.View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: authTokens.welcomeBg,
    overflow: 'hidden',
  },
  contentStack: {
    flex: 1,
    paddingHorizontal: 28,
    zIndex: 2,
  },
  hero: {
    flex: 1,
    alignItems: 'center',
    // Center vertically AND push the stack downward so the Fern logo
    // itself lands near the visual middle of the screen — not just
    // the middle of the area above the CTAs (which would feel "too
    // high"). The wordmark sits as a caption immediately below.
    justifyContent: 'center',
    paddingTop: 120,
  },
  // Optical centering for the Fern: the stem/pill sit ~22pt left of
  // the SVG's geometric centre, so we shift the wrapper right by the
  // same amount to align the visual axis with the wordmark below.
  logoOpticalAlign: {
    transform: [{ translateX: 22 }],
  },
  wordmarkRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    // Tighter gap: the wordmark reads as a label for the logo
    // rather than a separate element floating below it.
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
  ctaBlock: {
    paddingTop: 8,
  },
  primaryCta: {
    width: '100%',
    height: 56,
    borderRadius: 18,
    backgroundColor: authTokens.surfaceCream,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: authTokens.softShadow,
  },
  primaryCtaLabel: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: -0.3,
    color: authTokens.welcomeBg,
  },
  primaryCtaArrow: {
    marginLeft: 8,
  },
  secondaryCta: {
    width: '100%',
    height: 52,
    marginTop: 12,
    borderRadius: 18,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: 'rgba(255,251,242,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryCtaLabel: {
    fontSize: 15,
    fontWeight: '500',
    letterSpacing: -0.2,
    color: '#FFFBF2',
  },
  fineprint: {
    marginTop: 22,
    fontSize: 11,
    fontWeight: '400',
    color: 'rgba(255,251,242,0.38)',
    textAlign: 'center',
  },
  fineprintLink: {
    textDecorationLine: 'underline',
    color: 'rgba(255,251,242,0.38)',
  },
})

export default WelcomeScreen
