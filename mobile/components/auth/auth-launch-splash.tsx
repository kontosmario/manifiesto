import { useCallback, useEffect, useMemo, useState } from 'react'
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native'
import Animated, {
  Easing,
  runOnJS,
  useAnimatedReaction,
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

// Particle field — 24 fireflies sprinkled across the canvas. The
// distribution formulas (i * 13 + 8 mod 90, i * 19 + 15 mod 80) give
// a quasi-random spread without any actual randomness, so the layout
// is deterministic across mounts. Each particle has a unique
// duration + delay so the field never twinkles in sync.
const PARTICLE_COUNT = 24
const PARTICLES = Array.from({ length: PARTICLE_COUNT }, (_, i) => ({
  key: i,
  leftPct: (i * 13 + 8) % 90,
  topPct: (i * 19 + 15) % 80,
  duration: 8000 + (i % 5) * 1800,
  delay: i * 450,
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
        <AuroraLayer width={width} height={height} />
        <ParticleLayer width={width} height={height} reduced={reduced} />

        <View
          style={[
            styles.contentStack,
            { paddingTop: insets.top + 24, paddingBottom: 24 },
          ]}
        >
          <View style={styles.hero}>
            {/*
              v2 Fern is horizontally symmetric — no optical shift
              needed. The splash → welcome handoff still lands the
              logo at identical coordinates because welcome-screen
              also dropped the shift.
            */}
            <FernLogo size={220} palette="light" animate={!reduced} delay={300} />

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
            (primary 56 + 12 gap + secondary 52 + 22 gap + fineprint).
            Reserves the exact space the CTAs occupy on welcome so the
            hero above is at identical y coordinates on both screens.

            Fineprint usa Text con el MISMO contenido que welcome
            (no un View con height fijo) porque en web el Text wrappea
            según el ancho del DOM container — un width angosto fuerza
            2 líneas (~32px), un width ancho cabe en 1 línea (~14px).
            Un View de altura fija no se adapta y termina misalineado
            con la versión del welcome, generando un "salto" visible
            durante el fade-out de 220ms del splash. El Text invisible
            wrappea idéntico → alineación pixel-perfect en cualquier
            viewport.
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
            <Text style={styles.ctaReserveFineprint}>
              Al continuar aceptas los Términos y la Privacidad
            </Text>
          </View>
        </View>
      </View>
    </Animated.View>
  )
}

// ─────────────────────────────────────────────────────────────
// Aurora — two large soft circles that twinkle in randomized
// positions. Each blob lives within a fixed `zone` (top half vs
// bottom half of the canvas) so they NEVER overlap, regardless of
// where the random pick lands. Within its zone, the position is
// re-rolled every time the blob's opacity bottoms out — so each
// fade-in cycle places the blob at a fresh, unpredictable spot.
//
// ─────────────────────────────────────────────────────────────
interface AuroraZone {
  /** Inclusive % bounds for the random position pick. */
  leftMin: number
  leftMax: number
  topMin: number
  topMax: number
}

interface AuroraBlobConfig {
  key: number
  zone: AuroraZone
  size: number
  color: string
  duration: number
  delay: number
}

// Top half + bottom half. Vertical separation is the no-overlap
// guarantee — the zones share NO y-range, so the bounding boxes
// can't intersect even if both blobs randomize to the same x.
const ZONE_TOP: AuroraZone = { leftMin: 12, leftMax: 88, topMin: 8, topMax: 32 }
const ZONE_BOTTOM: AuroraZone = { leftMin: 12, leftMax: 88, topMin: 62, topMax: 90 }

const AURORA_BLOBS: AuroraBlobConfig[] = [
  {
    key: 0,
    zone: ZONE_TOP,
    size: 280,
    color: 'rgba(242,181,138,0.18)', // peach
    duration: 11000,
    delay: 0,
  },
  {
    key: 1,
    zone: ZONE_BOTTOM,
    size: 300,
    color: 'rgba(199,238,156,0.16)', // soft green
    duration: 13000,
    delay: 5500,
  },
]

interface AuroraPosition {
  leftPct: number
  topPct: number
}

function pickPositionInZone(zone: AuroraZone): AuroraPosition {
  return {
    leftPct: zone.leftMin + Math.random() * (zone.leftMax - zone.leftMin),
    topPct: zone.topMin + Math.random() * (zone.topMax - zone.topMin),
  }
}

// Module-level static positions — picked ONCE when this module first
// loads (at app launch) and reused across every `<AuroraLayer
// randomize={false}>` mount throughout the session. This is what
// makes the cold-start splash and the welcome screen show the blobs
// in the SAME positions: both consume these constants. The warm
// transition splash bypasses these by passing `randomize={true}`,
// which switches each blob to per-cycle re-rolls inside its zone.
const STATIC_AURORA_POSITIONS: Record<number, AuroraPosition> = {
  0: pickPositionInZone(ZONE_TOP),
  1: pickPositionInZone(ZONE_BOTTOM),
}

export function AuroraLayer({
  width,
  height,
  /**
   * - `false` (default): blobs sit at fixed positions for the lifetime
   *   of the app session (picked once at module load, shared by every
   *   AuroraLayer mount). Used by the cold-start splash and the
   *   welcome screen so the splash → welcome handoff is seamless.
   * - `true`: each blob re-rolls its position within its zone every
   *   time it fades out. Used by the warm post-login transition splash
   *   so the bridge feels alive and unpredictable.
   */
  randomize = false,
}: {
  width: number
  height: number
  randomize?: boolean
}) {
  return (
    <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
      {AURORA_BLOBS.map((blob) => (
        <AuroraBlob
          key={blob.key}
          config={blob}
          parentWidth={width}
          parentHeight={height}
          randomize={randomize}
        />
      ))}
    </View>
  )
}

function AuroraBlob({
  config,
  parentWidth,
  parentHeight,
  randomize,
}: {
  config: AuroraBlobConfig
  parentWidth: number
  parentHeight: number
  randomize: boolean
}) {
  const t = useSharedValue(0)
  // Initial position:
  //  - randomize=true: random pick within the zone, will be re-rolled
  //    on every fade-out (see useAnimatedReaction below).
  //  - randomize=false: fixed module-level position so the blob lands
  //    at the same coords for every static mount (cold-start splash
  //    + welcome screen agree on layout).
  const [position, setPosition] = useState<AuroraPosition>(() =>
    randomize
      ? pickPositionInZone(config.zone)
      : STATIC_AURORA_POSITIONS[config.key] ??
        pickPositionInZone(config.zone),
  )
  // JS-thread reroll callback. Worklets can't call `pickPositionInZone`
  // directly (it isn't a worklet — passing it as a runOnJS arg
  // crashes the UI runtime, see project memory). The worklet just
  // signals "reroll now"; this JS callback does the Math.random +
  // setState. No-op when `randomize` is false.
  const rerollPosition = useCallback(() => {
    setPosition(pickPositionInZone(config.zone))
  }, [config.zone])

  // useUnboundedLoopAnimation handles unmount cleanup + reduced motion
  // (parks at 0 = invisible). The splash lives outside the
  // NavigationContainer, so the focus-bound `useLoopAnimation` would
  // never start the loops here.
  useUnboundedLoopAnimation(
    () => {
      t.value = withDelay(
        config.delay,
        withRepeat(
          withSequence(
            withTiming(1, {
              duration: config.duration / 2,
              easing: Easing.inOut(Easing.quad),
            }),
            withTiming(0, {
              duration: config.duration / 2,
              easing: Easing.inOut(Easing.quad),
            }),
          ),
          -1,
          false,
        ),
      )
    },
    [t],
    [config.duration, config.delay],
  )

  // Re-roll the position every time the blob fades out — ONLY when
  // `randomize` is true. The bell-curve opacity (sin(t * π)) hits ~0
  // twice per full t cycle: once at t=0, once at t=1. We track "is
  // the blob currently visible above threshold" and fire the reroll
  // on the falling edge (true → false). Worklet calls a stable JS
  // callback (rerollPosition); never invokes a JS function inline,
  // which would crash the UI runtime.
  useAnimatedReaction(
    () => randomize && Math.sin(t.value * Math.PI) > 0.04,
    (visible, prev) => {
      'worklet'
      if (prev === true && visible === false) {
        runOnJS(rerollPosition)()
      }
    },
    [rerollPosition, randomize],
  )

  const style = useAnimatedStyle(() => {
    'worklet'
    const phase = t.value * Math.PI
    return {
      // Bell-curve opacity: invisible at the extremes, peak at the
      // middle. Alpha is baked into the rgba color per blob.
      opacity: Math.sin(phase),
      // Subtle scale breath during the twinkle so the blob looks
      // alive rather than just a flat fade.
      transform: [{ scale: 0.9 + Math.sin(phase) * 0.18 }],
    }
  })

  // Position is centered on the configured % (subtract half size to
  // convert center → top-left for absolute positioning).
  const left = (position.leftPct / 100) * parentWidth - config.size / 2
  const top = (position.topPct / 100) * parentHeight - config.size / 2

  return (
    <Animated.View
      style={[
        styles.auroraBlob,
        {
          width: config.size,
          height: config.size,
          borderRadius: config.size / 2,
          left,
          top,
          backgroundColor: config.color,
        },
        style,
      ]}
    />
  )
}

// ─────────────────────────────────────────────────────────────
// Particles — cloned from welcome-screen.tsx with identical
// indices/positions/colors so the field doesn't visibly jump
// when the splash hands off to welcome.
// ─────────────────────────────────────────────────────────────
export function ParticleLayer({
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

  // Lissajous-style organic drift — see welcome-screen.tsx Particle
  // for the rationale. Same envelope (~26pt vertical, ~8pt lateral)
  // and same per-particle desync (duration + delay) so the splash
  // and welcome screen feel like the same particle field.
  //
  // Opacity uses a bell curve `sin(t * π)` so each particle is
  // INVISIBLE at the extremes of its cycle (t=0 and t=1) and peaks
  // in the middle — giving a firefly twinkle: the particle appears,
  // shines briefly, and fades out, then re-emerges later. Combined
  // with the 8 particles' different durations + delays, the effect
  // feels random rather than synchronised.
  const style = useAnimatedStyle(() => {
    'worklet'
    const phase = t.value * Math.PI
    return {
      transform: [
        { translateY: -Math.sin(phase) * 26 },
        { translateX: Math.sin(phase * 2) * 8 },
      ],
      opacity: Math.sin(phase) * 0.7,
    }
  })

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
  // Fineprint reserve: mismas métricas que welcome.styles.fineprint,
  // pero color transparent para que sea invisible. El Text wrappea
  // según el viewport igual que el del welcome, así la altura
  // calculada coincide exacta y la alineación del wordmark/logo
  // arriba no salta cuando el splash hace fade-out.
  ctaReserveFineprint: {
    marginTop: 22,
    fontSize: 11,
    fontWeight: '400',
    color: 'transparent',
    textAlign: 'center',
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
