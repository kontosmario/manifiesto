import { useEffect, useMemo, useRef } from 'react'
import { StyleSheet, View } from 'react-native'
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'
import { useReducedMotion } from '@/hooks/use-reduced-motion'
import { useAppTheme } from '@/theme/theme-provider'

/**
 * Lightweight Reanimated confetti.
 *
 * Use case: micro-celebration on completing an action (mark-paid,
 * meta alcanzada, ciclo cerrado bajo cupo). NOT a full-page Sonny
 * Wrapped affair — kept brief so it reads as "ok, hecho" rather than
 * "the app is congratulating itself".
 *
 * Motion model — smoother v2
 * --------------------------
 * - **Per-particle stagger**: each particle has a `delayPct` offset
 *   (0 to ~12% of the timeline) baked in. Inside the worklet, we
 *   compute `localP = (t - delayPct) / (1 - delayPct)` so particles
 *   emerge in waves rather than all bursting at the same frame. The
 *   eye reads this as "fluid spread" instead of "single pop".
 * - **Smooth explode→fall handoff**: explode uses an ease-out cubic
 *   so particles decelerate naturally toward their peak. Fall uses
 *   quadratic acceleration (gravity feel). The two phases overlap
 *   slightly (no abrupt switch).
 * - **Gentle horizontal wobble during fall**: a small sin modulation
 *   adds organic drift. Different phase per particle (via index).
 * - **Eased fade-out**: instead of linear, opacity uses
 *   `1 - fadeProgress^1.5` so the tail trails gently.
 * - **Longer duration**: 1700ms total (was 1320) for a more
 *   deliberate, less frantic feel.
 *
 * Design notes (unchanged from v1)
 * --------------------------------
 * - **Imperative-via-token**: pass an increasing `pulseToken`. 0/null
 *   keeps it inert (no allocation, no DOM, no animated hooks).
 * - **GPU-only**: every per-particle property animates `transform` +
 *   `opacity`. Nothing touches layout.
 * - **Worklet-safe**: closures capture plain primitives; no function
 *   calls inside the worklet (project memory: that crashes the
 *   Reanimated runtime).
 * - **Easing from Reanimated** (NOT react-native — mixing crashes at
 *   runtime per project memory `feedback_reanimated_easing_runtime`).
 * - **Reduced motion**: renders null when the user opted out.
 */
interface ConfettiBurstProps {
  /** Increment this to fire a new burst. 0 / undefined = inert. */
  pulseToken?: number
  /** Particle count. 18 default — enough density to read as "celebration"
   *  without overwhelming. */
  count?: number
  /** Origin offset relative to the parent. Defaults to centered. */
  originY?: number
}

interface ParticleConfig {
  index: number
  angle: number
  velocity: number
  rotationEnd: number
  color: string
  size: number
  /** Per-particle start delay as a fraction of the global timeline.
   *  Range ~0–0.12. Distributes the burst in time so particles
   *  emerge as a smooth wave instead of a single frame pop. */
  delayPct: number
  /** Horizontal wobble phase offset. Keeps each particle's sin curve
   *  out of phase from its neighbors during the fall. */
  wobblePhase: number
}

// Total duration in ms. v2 is ~30% longer than v1 (was 1320) to give
// the celebration a more measured, less frantic feel — confetti that
// blinks past too quickly registers as a glitch rather than a moment.
const TOTAL_MS = 1700

export function ConfettiBurst({
  pulseToken,
  count = 18,
  originY = 0,
}: ConfettiBurstProps) {
  const reduced = useReducedMotion()
  const { theme } = useAppTheme()
  // One shared progress driver shared by every particle. Cheaper than
  // N independent timing values, and guarantees they stay in phase.
  const t = useSharedValue(0)
  // Track the most recent token we already played so back-to-back
  // identical tokens don't accidentally restart the burst.
  const lastTokenRef = useRef<number | null>(null)

  // Build the particle config once. Each particle has a fixed angle,
  // velocity and color baked in — the variance is the magic that
  // makes the burst feel organic without runtime randomness inside
  // the worklet (which the Reanimated runtime can't access).
  const particles = useMemo<ParticleConfig[]>(() => {
    if (reduced) return []
    const palette = [
      theme.brand.bright,       // mint
      theme.colors.peach,       // warm accent
      theme.colors.peachBand,
      theme.colors.creamCard,
      theme.brand.deep,
    ]
    const out: ParticleConfig[] = []
    for (let i = 0; i < count; i++) {
      // Spread evenly around the circle with a tiny jitter so it
      // doesn't read as a clock face. Jitter is deterministic per
      // index (just a sin) so the burst is reproducible.
      const baseAngle = (i / count) * Math.PI * 2
      const jitter = Math.sin(i * 7.31) * 0.18
      out.push({
        index: i,
        angle: baseAngle + jitter,
        velocity: 120 + Math.abs(Math.sin(i * 13.7)) * 80, // 120–200 px
        rotationEnd: 360 + (i % 5) * 90,                    // varied spins
        color: palette[i % palette.length] ?? theme.brand.bright,
        // Slightly larger particles (7-11 vs 6-10) — visibility on
        // light backgrounds was borderline at the smaller sizes.
        size: 7 + (i % 3) * 2,
        // Stagger: particle i waits (i / count) * 0.12 of the
        // timeline before starting. Visual wave from first to last
        // particle ≈ 200ms across the full burst.
        delayPct: (i / count) * 0.12,
        // Wobble: each particle has its own sin phase so the
        // horizontal drift during fall doesn't read as synchronized.
        wobblePhase: i * 0.83,
      })
    }
    return out
  }, [count, reduced, theme])

  useEffect(() => {
    if (reduced) return
    if (!pulseToken) return
    if (lastTokenRef.current === pulseToken) return
    lastTokenRef.current = pulseToken
    // Reset to 0 instantly, then drive to 1 with a strong ease-out.
    // The reset is needed because withTiming from the current value
    // would interpolate from the previous endpoint (animation feels
    // truncated on repeat presses).
    t.value = 0
    t.value = withTiming(1, {
      duration: TOTAL_MS,
      // Bezier (ease-out-expo) — smoother than out.cubic and matches
      // the curve used elsewhere in the site for "natural deceleration".
      easing: Easing.bezier(0.16, 1, 0.30, 1),
    })
  }, [pulseToken, reduced, t])

  if (reduced || particles.length === 0) return null
  // Inert (no DOM, no animated hooks) until a non-zero pulseToken
  // arrives. Keeps 20+ FijoRow siblings free of animated hooks at
  // idle. The very first pulse mounts the particles; subsequent
  // pulses re-fire via `withTiming` without remount.
  if (!pulseToken) return null

  return (
    <View pointerEvents="none" style={[styles.host, { top: originY }]}>
      {particles.map((p) => (
        <Particle key={p.index} config={p} t={t} />
      ))}
    </View>
  )
}

function Particle({
  config,
  t,
}: {
  config: ParticleConfig
  t: ReturnType<typeof useSharedValue<number>>
}) {
  // Endpoints baked into closures — the worklet reads them through
  // the closure (Reanimated supports closure capture of plain JS
  // primitives, just not function calls).
  const vxFinal = Math.cos(config.angle) * config.velocity
  const vyFinal = Math.sin(config.angle) * config.velocity
  const rotationEnd = config.rotationEnd
  const delayPct = config.delayPct
  const wobblePhase = config.wobblePhase

  const animated = useAnimatedStyle(() => {
    'worklet'
    const global = t.value

    // ── Per-particle local time ──────────────────────────────────
    // Particles ramp up in waves. Before their delay, they sit at 0
    // (invisible, off-origin). After, localP runs 0→1 over the
    // remaining timeline.
    const localP =
      global <= delayPct
        ? 0
        : Math.min(1, (global - delayPct) / (1 - delayPct))

    // ── Explode phase ────────────────────────────────────────────
    // Particles reach their peak outward distance around localP=0.30.
    // The ease-out cubic makes them decelerate naturally toward peak
    // (no flat-then-stop discontinuity).
    const explodeRaw = Math.min(localP / 0.3, 1)
    const explode = 1 - Math.pow(1 - explodeRaw, 3) // ease-out cubic

    // ── Fall phase ───────────────────────────────────────────────
    // Starts soft at localP=0.22 (overlap with end of explode for a
    // smooth handoff — no abrupt phase boundary) and accelerates
    // quadratically (gravity feel).
    const fallRaw = Math.max(0, (localP - 0.22) / 0.78)
    const fallY = 260 * fallRaw * fallRaw

    // ── Horizontal wobble ────────────────────────────────────────
    // Gentle sin during fall so particles aren't ruler-straight.
    // Out of phase per particle (wobblePhase).
    const wobble = Math.sin(localP * 6.2832 + wobblePhase) * 8 * fallRaw

    const x = vxFinal * explode + wobble
    const y = vyFinal * explode + fallY
    const rot = localP * rotationEnd

    // ── Fade-out ─────────────────────────────────────────────────
    // Begins at localP=0.6, eased with a 1.5 exponent so the trail
    // is gentler than a linear fade. By localP=1.0 the particle is
    // fully invisible.
    const fadeStart = 0.6
    const fadeProgress =
      localP <= fadeStart ? 0 : (localP - fadeStart) / (1 - fadeStart)
    const opacity = 1 - Math.pow(fadeProgress, 1.5)

    // ── Scale-in ─────────────────────────────────────────────────
    // Smoothly grows over the first ~8% of the particle's local
    // timeline. Avoids the t=0 "tiny dot at origin" artifact.
    const scaleIn =
      localP < 0.08 ? 0.55 + (localP / 0.08) * 0.45 : 1

    return {
      opacity: opacity * (localP > 0 ? 1 : 0), // hard-zero before delay
      transform: [
        { translateX: x },
        { translateY: y },
        { rotate: `${rot}deg` },
        { scale: scaleIn },
      ],
    }
  })

  return (
    <Animated.View
      style={[
        styles.particle,
        {
          backgroundColor: config.color,
          width: config.size,
          height: config.size,
          borderRadius: config.size / 3, // slightly rounded squares
        },
        animated,
      ]}
    />
  )
}

const styles = StyleSheet.create({
  host: {
    position: 'absolute',
    left: '50%',
    width: 0,
    height: 0,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  particle: {
    position: 'absolute',
  },
})
