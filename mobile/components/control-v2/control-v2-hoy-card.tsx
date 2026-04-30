import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
} from 'react-native'
import Animated, {
  Easing,
  LinearTransition,
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated'
import { LinearGradient } from 'expo-linear-gradient'
import { MaterialIcons } from '@expo/vector-icons'
import { BreatheDot } from '@/components/home/animated/breathe-dot'
import { CountUpText } from '@/components/home/animated/count-up-text'
import { RiseView } from '@/components/home/animated/rise-view'
import { useLoopAnimation } from '@/hooks/use-loop-animation'
import { formatMoney } from '@/utils/money'
import { useAppTheme } from '@/theme/theme-provider'
import {
  getStateTokens,
  hexAlpha,
  type SemanticState,
} from '@/theme/state-tokens'

interface ControlV2HoyCardProps {
  cupoDiario: number
  gastoHoy: number
  libreHoy: number
  delta: number
  estaOk: boolean
  horaF: number
  horaActual: number
  minActual: number
  diaLabel: string
  /** Consecutive winning days ending yesterday. */
  racha: number
  /** Days that closed at or under the cupo this cycle. */
  diasGanadores: number
  /** Closed days of the cycle (excludes today). */
  closedDays: number
  /** Days remaining in the cycle (today inclusive). */
  diasRestantes: number
  /** Days until the next salary lands. */
  proximoSueldoEnDias: number
  /** Last-7 average ÷ previous-7 average. 1 = flat. */
  momentum: number
  /** No-spend days marked this cycle. */
  noSpendCount: number
  /** Whether the cumulative discretionary spend already crossed the
   *  full-cycle budget — used to escalate the status pill copy. */
  alreadyExhausted: boolean
}

/**
 * HOY hero — the principal card of Control v2.
 *
 * Designed for glanceability: a horizontal **pace bar** compares
 * actual spend (filled portion) against the proportional position of
 * the day (floating "AHORA" chip + vertical marker line). The visual
 * gap between fill and marker IS the delta — read at a glance.
 *
 * Layered chrome (back → front):
 *   1. Hero gradient shell + tone-tinted ambient blob in the corner
 *   2. Top-edge hairline highlight
 *   3. ShineOverlay (slow specular pass)
 *
 * Content hierarchy (top → bottom):
 *   · Header: day label + state pill.
 *   · Hero stat: marquee amount + signed delta chip + reference.
 *   · Pace bar: floating AHORA chip with arrow → marker line through
 *     a track with a sheen-gradient fill and a pulsing leading-edge
 *     dot. Below the bar a single combined label.
 *   · 3 stats chips (racha, días bajo cupo, días al cobro).
 *   · Smart hint with tone-tinted accent stripe.
 */
export function ControlV2HoyCard({
  cupoDiario,
  gastoHoy,
  libreHoy,
  delta,
  estaOk,
  horaF,
  horaActual,
  minActual,
  diaLabel,
  racha,
  diasGanadores,
  closedDays,
  diasRestantes,
  proximoSueldoEnDias,
  momentum,
  noSpendCount,
  alreadyExhausted,
}: ControlV2HoyCardProps) {
  const { theme } = useAppTheme()

  const state: SemanticState = alreadyExhausted
    ? 'critical'
    : libreHoy <= 0
      ? 'critical'
      : estaOk
        ? 'positive'
        : 'caution'

  const tokens = getStateTokens(state, theme)
  const heroText = theme.colors.heroText
  const heroAccent = theme.colors.heroAccent

  // ── Bright state hues for the hero gradient ─────────────────────
  // `tokens.fillSoft` (theme.success @ 55% alpha) ends up as a dim
  // greenish smudge on top of the dark-green hero gradient. We need
  // a **luminous** sister-palette designed specifically for use on
  // this card's chrome — same semantic mapping, but each hue is
  // bright enough to clear WCAG-AA on the deep hero green.
  const heroStateColor: Record<SemanticState, string> = {
    positive: '#C7EE9C', // bright pastel mint
    caution: '#F1D690', // bright butter yellow
    critical: '#F2B58A', // bright peach
    neutral: 'rgba(246,251,239,0.92)',
  }
  const stateBright = heroStateColor[state]

  // ── Local high-contrast palette ─────────────────────────────────
  // Theme `heroMuted2` (0.55 alpha) was too low for tiny captions on
  // the dark gradient. We bump every secondary tone locally so each
  // typographic level reads independently.
  const textPrimary = heroText // 100% — marquee, big values
  const textSecondary = 'rgba(246,251,239,0.92)' // strong sub-headings
  const textBody = 'rgba(246,251,239,0.78)' // captions, sub
  const textHint = 'rgba(246,251,239,0.62)' // subtle micro

  // ── Chip surfaces ───────────────────────────────────────────────
  // All chips share the same neutral white-translucent surface, the
  // same pattern Home/Gastos/Fijos hero cards use. State info comes
  // from the icon hue inside, NOT from the chip background — that
  // way "positive" chips don't disappear into a green hero gradient.
  const trackBg = 'rgba(0,0,0,0.50)' // deep inset → fill pops on top
  const trackBorder = 'rgba(255,255,255,0.18)'
  const chipBg = 'rgba(255,255,255,0.10)'
  const chipBorder = 'rgba(255,255,255,0.20)'
  const markerChipBg = 'rgba(20,32,28,0.92)'
  const markerChipBorder = hexAlpha(heroAccent, 0.45)

  // Categorical colors for stat-chip icons — distinct hues so all
  // three stats read separately at a glance, regardless of state.
  const ICON_RACHA = '#F1D690' // warm yellow (fire)
  const ICON_BAJO_CUPO = heroAccent // bright pastel mint
  const ICON_AL_COBRO = '#F2B58A' // warm peach (calendar)

  const minutos = `${String(horaActual).padStart(2, '0')}:${String(minActual).padStart(2, '0')}`

  const spentPct = clamp((gastoHoy / Math.max(1, cupoDiario)) * 100, 0, 100)
  const pacePct = clamp((horaF / 24) * 100, 0, 100)
  // Clamp the floating chip's horizontal anchor so the chip never
  // gets clipped at the bar edges. The marker line itself uses the
  // raw `pacePct` — only the chip+arrow composite is constrained.
  const chipAnchorPct = clamp(pacePct, 12, 88)

  const deltaPositive = delta >= 0
  const deltaIcon: keyof typeof MaterialIcons.glyphMap = deltaPositive
    ? 'trending-down'
    : 'trending-up'
  const deltaSign = deltaPositive ? '+' : '−'

  const heroAmountValue = libreHoy > 0 ? libreHoy : Math.abs(libreHoy)
  const heroEyebrowText = libreHoy > 0 ? 'DISPONIBLE HOY' : 'CUPO EXCEDIDO'

  // Derived percentage for the combined label under the bar.
  const spentPctRound = Math.round(spentPct)

  // Combined "spent" label below the bar — switches to a dedicated
  // copy when there's no spend yet (so the user doesn't see "$0 · 0%
  // del cupo" which reads as a weird metric).
  const spentBarLabel =
    gastoHoy <= 0
      ? { money: 'Sin gastos hoy', pct: 'el cupo está intacto' }
      : {
          money: formatMoney(gastoHoy),
          pct: `${spentPctRound}% del cupo`,
        }

  const hint = pickHint({
    state,
    libreHoy,
    delta,
    racha,
    momentum,
    closedDays,
    diasGanadores,
    diasRestantes,
    proximoSueldoEnDias,
    noSpendCount,
    alreadyExhausted,
  })

  // ── Animation: full motion choreography ────────────────────────
  // The card has 6 layered animations, each with a clear semantic
  // role. They're all UI-thread (Reanimated), pause on blur via
  // `useLoopAnimation`, and respect prefers-reduced-motion.
  //
  //   Perpetual loops:
  //     · particleWave  — single shared 0→1 sweep that drives the
  //                       state-tinted particle field (each particle
  //                       reads `(wave + phase) % 1` so the field
  //                       cascades organically, like floating embers)
  //     · shimmer       — band traveling left→right inside the fill
  //                       (evokes "rhythm in motion")
  //     · sonar         — staggered rings from the leading-edge dot
  //                       (marks the "current spend" as a live point)
  //     · markerHalo    — soft glow pulse around the marker line
  //                       ("now is now" emphasis)
  //     · ahoraFloat    — gentle vertical float of the AHORA chip
  //                       ("tethered to the passage of time")
  //     · hintBreath    — scale breath on the hint icon badge
  //                       (signals the hint is "thinking" / live)
  //
  //   One-shot on mount/data change:
  //     · fillProgress  — bar fill grows from 0% to spentPct on
  //                       mount, and re-animates on data updates
  //                       (pairs the visual with CountUpText's
  //                       number ticker)
  const reducedMotion = useReducedMotion()
  const shimmer = useSharedValue(0)
  const sonar = useSharedValue(0)
  const particleWave = useSharedValue(0)
  const markerHalo = useSharedValue(0)
  const ahoraFloat = useSharedValue(0)
  const hintBreath = useSharedValue(0)
  useLoopAnimation(
    () => {
      shimmer.value = withRepeat(
        withSequence(
          withTiming(1, { duration: 3200, easing: Easing.inOut(Easing.ease) }),
          withTiming(0, { duration: 0 }),
        ),
        -1,
        false,
      )
      sonar.value = withRepeat(
        withSequence(
          withTiming(1, { duration: 2400, easing: Easing.out(Easing.ease) }),
          withTiming(0, { duration: 0 }),
        ),
        -1,
        false,
      )
      // Single shared wave that drives the particle field. 9s linear
      // sweep, looped with instant reset. Each particle reads
      // `(wave + phase) % 1` so the field cascades organically.
      particleWave.value = withRepeat(
        withSequence(
          withTiming(1, { duration: 9000, easing: Easing.linear }),
          withTiming(0, { duration: 0 }),
        ),
        -1,
        false,
      )
      // Marker halo — 3.6s breath.
      markerHalo.value = withRepeat(
        withSequence(
          withTiming(1, { duration: 1800, easing: Easing.inOut(Easing.sin) }),
          withTiming(0, { duration: 1800, easing: Easing.inOut(Easing.sin) }),
        ),
        -1,
        false,
      )
      // AHORA chip subtle float — 5s, ±1.5pt translateY.
      ahoraFloat.value = withRepeat(
        withSequence(
          withTiming(1, { duration: 2500, easing: Easing.inOut(Easing.sin) }),
          withTiming(0, { duration: 2500, easing: Easing.inOut(Easing.sin) }),
        ),
        -1,
        false,
      )
      // Hint icon badge breath — 5s, scale 1.0 ↔ 1.06.
      hintBreath.value = withRepeat(
        withSequence(
          withTiming(1, { duration: 2500, easing: Easing.inOut(Easing.sin) }),
          withTiming(0, { duration: 2500, easing: Easing.inOut(Easing.sin) }),
        ),
        -1,
        false,
      )
    },
    [shimmer, sonar, particleWave, markerHalo, ahoraFloat, hintBreath],
  )

  // Fill-bar growth — animates from 0% to spentPct on mount, and
  // re-animates when spentPct changes (live spending updates). Skip
  // the one-shot when reduced motion is on (jump to value).
  const fillProgress = useSharedValue(0)
  useEffect(() => {
    if (reducedMotion) {
      fillProgress.value = spentPct
      return
    }
    fillProgress.value = withDelay(
      220,
      withTiming(spentPct, { duration: 1000, easing: Easing.out(Easing.cubic) }),
    )
  }, [spentPct, fillProgress, reducedMotion])

  return (
    <RiseView delay={80}>
      <Animated.View layout={LinearTransition.duration(260)}>
        <LinearGradient
          colors={[...theme.colors.heroGradient] as unknown as readonly [string, string, ...string[]]}
          start={{ x: 0.1, y: 0 }}
          end={{ x: 0.9, y: 1 }}
          style={styles.card}
        >
          <ParticleField
            color={stateBright}
            wave={particleWave}
          />
          <View pointerEvents="none" style={styles.topHighlight} />

          {/* ── Header ── */}
          <View style={styles.headerRow}>
            <View style={styles.eyebrowRow}>
              <BreatheDot size={8} color={stateBright} glow={stateBright} />
              <Text style={[styles.eyebrow, { color: heroAccent }]}>
                {diaLabel}
              </Text>
            </View>
            <View
              style={[
                styles.statusPill,
                { backgroundColor: chipBg, borderColor: chipBorder },
              ]}
            >
              <MaterialIcons name={tokens.icon} size={14} color={stateBright} />
              <Text style={[styles.statusPillText, { color: stateBright }]}>
                {tokens.label}
              </Text>
            </View>
          </View>

          {/* ── Hero stat ── */}
          <View style={styles.heroStat}>
            <Text style={[styles.heroEyebrow, { color: textBody }]}>
              {heroEyebrowText}
            </Text>
            <View style={styles.amountRow}>
              <CountUpText
                value={Math.max(0, heroAmountValue)}
                duration={1200}
                format={(n) => formatMoney(n)}
                style={[styles.heroAmount, { color: textPrimary }]}
              />
              {/*
                Delta tag — two-line micro-card. Top line: signed
                amount with directional arrow (state-colored).
                Bottom line: explicit "vs ritmo" / "sobre ritmo" so
                the user understands what the +/− is comparing
                against. Without that caption, just an arrow + amount
                reads as ambiguous ("baja de qué?").
              */}
              <View
                style={[
                  styles.deltaTag,
                  { backgroundColor: chipBg, borderColor: chipBorder },
                ]}
              >
                <View style={styles.deltaTagAmountRow}>
                  <MaterialIcons name={deltaIcon} size={13} color={stateBright} />
                  <Text style={[styles.deltaTagAmount, { color: stateBright }]}>
                    {deltaSign}{formatMoney(Math.abs(delta))}
                  </Text>
                </View>
                <Text style={[styles.deltaTagCaption, { color: textBody }]}>
                  {deltaPositive ? 'BAJO RITMO' : 'SOBRE RITMO'}
                </Text>
              </View>
            </View>
            <Text style={[styles.heroSub, { color: textBody }]}>
              de {formatMoney(cupoDiario)} cupo del día
            </Text>
          </View>

          {/* ── Pace bar ── */}
          <PaceBar
            spentPct={spentPct}
            pacePct={pacePct}
            chipAnchorPct={chipAnchorPct}
            fillColor={stateBright}
            fillSheen={hexAlpha(tokens.fg, 1)}
            trackBg={trackBg}
            trackBorder={trackBorder}
            markerColor={heroAccent}
            markerChipBg={markerChipBg}
            markerChipBorder={markerChipBorder}
            markerLabel={`AHORA · ${minutos}`}
            spentMoneyText={spentBarLabel.money}
            spentPctText={spentBarLabel.pct}
            spentHasMoney={gastoHoy > 0}
            textPrimary={textPrimary}
            textBody={textBody}
            textHint={textHint}
            shimmer={shimmer}
            sonar={sonar}
            fillProgress={fillProgress}
            markerHalo={markerHalo}
            ahoraFloat={ahoraFloat}
          />

          {/* ── Stats row ── */}
          <View style={styles.statsRow}>
            <RiseView delay={420} style={styles.statChipFlex}>
              <StatChip
                icon="local-fire-department"
                iconColor={racha > 0 ? ICON_RACHA : textHint}
                label={racha > 0 ? `${racha}` : '—'}
                caption="Racha"
                text={textPrimary}
                minor={textBody}
                background={chipBg}
                border={chipBorder}
              />
            </RiseView>
            <RiseView delay={480} style={styles.statChipFlex}>
              <StatChip
                icon="military-tech"
                iconColor={ICON_BAJO_CUPO}
                label={closedDays > 0 ? `${diasGanadores}/${closedDays}` : '—'}
                caption="Bajo cupo"
                text={textPrimary}
                minor={textBody}
                background={chipBg}
                border={chipBorder}
              />
            </RiseView>
            <RiseView delay={540} style={styles.statChipFlex}>
              <StatChip
                icon="event"
                iconColor={ICON_AL_COBRO}
                label={proximoSueldoEnDias <= 0 ? 'Hoy' : `${proximoSueldoEnDias}d`}
                caption="Al cobro"
                text={textPrimary}
                minor={textBody}
                background={chipBg}
                border={chipBorder}
              />
            </RiseView>
          </View>

          {/* ── Smart hint ── */}
          <RiseView delay={640}>
          <View
            style={[
              styles.hintRow,
              { backgroundColor: chipBg, borderColor: chipBorder },
            ]}
          >
            {/* State-colored stripe — flush against the left edge */}
            <View
              style={[styles.hintAccent, { backgroundColor: stateBright }]}
            />
            {/* Icon badge — neutral surface, pulses subtly so the
                hint feels "alive". */}
            <HintIconBadge
              icon={hint.icon}
              color={stateBright}
              breath={hintBreath}
            />
            <Text style={[styles.hintText, { color: textPrimary }]}>
              {hint.text}
            </Text>
          </View>
          </RiseView>
        </LinearGradient>
      </Animated.View>
    </RiseView>
  )
}

// ─── Helpers ───────────────────────────────────────────────────────

function clamp(n: number, lo: number, hi: number): number {
  if (!Number.isFinite(n)) return lo
  if (n < lo) return lo
  if (n > hi) return hi
  return n
}

interface HintInput {
  state: SemanticState
  libreHoy: number
  delta: number
  racha: number
  momentum: number
  closedDays: number
  diasGanadores: number
  diasRestantes: number
  proximoSueldoEnDias: number
  noSpendCount: number
  alreadyExhausted: boolean
}

interface Hint {
  icon: keyof typeof MaterialIcons.glyphMap
  text: string
}

function pickHint(i: HintInput): Hint {
  if (i.alreadyExhausted) {
    return {
      icon: 'report',
      text: `Presupuesto libre del ciclo agotado. Quedan ${i.diasRestantes} ${
        i.diasRestantes === 1 ? 'día' : 'días'
      } al próximo cobro.`,
    }
  }
  if (i.libreHoy <= 0) {
    return {
      icon: 'pause-circle-outline',
      text: 'Cupo del día agotado. Mañana se reinicia con el cupo completo.',
    }
  }
  if (i.closedDays === 0) {
    return {
      icon: 'play-circle-outline',
      text: 'Primer día del ciclo. El ritmo de hoy define el resto del mes.',
    }
  }
  if (i.racha >= 3) {
    return {
      icon: 'local-fire-department',
      text: `Racha de ${i.racha} días bajo cupo en curso.`,
    }
  }
  if (i.momentum >= 1.2 && i.closedDays >= 7) {
    const pct = Math.round((i.momentum - 1) * 100)
    return {
      icon: 'trending-up',
      text: `Gasto semanal +${pct}% vs la semana anterior.`,
    }
  }
  if (i.momentum <= 0.85 && i.closedDays >= 7) {
    const pct = Math.round((1 - i.momentum) * 100)
    return {
      icon: 'trending-down',
      text: `Gasto semanal −${pct}% vs la semana anterior.`,
    }
  }
  if (i.state === 'caution') {
    return {
      icon: 'speed',
      text: 'Ritmo adelantado al cupo del día. Conviene moderar el gasto.',
    }
  }
  if (
    i.closedDays >= 3 &&
    i.diasGanadores >= Math.max(1, i.closedDays - 1)
  ) {
    return {
      icon: 'verified',
      text: 'Casi todos los días del ciclo cierran dentro del cupo.',
    }
  }
  if (i.noSpendCount > 0) {
    return {
      icon: 'savings',
      text: `${i.noSpendCount} ${
        i.noSpendCount === 1 ? 'día' : 'días'
      } sin gasto en el ciclo — suma a la alcancía.`,
    }
  }
  return {
    icon: 'event',
    text: `Quedan ${i.diasRestantes} ${
      i.diasRestantes === 1 ? 'día' : 'días'
    } hasta el próximo cobro.`,
  }
}

// ─── ParticleField ─────────────────────────────────────────────────

interface ParticleSpec {
  /** Anchor X position in card coordinates (px). */
  x: number
  /** Anchor Y position in card coordinates (px). */
  y: number
  /** Particle radius in px. Mixed sizes feel organic. */
  size: number
  /** Total horizontal drift across one cycle (px, can be negative). */
  driftX: number
  /** Total vertical drift across one cycle (px). Negative = upward. */
  driftY: number
  /** Maximum opacity at the bell-curve peak. */
  maxOpacity: number
  /** Phase offset 0–1 — where in the cycle this particle starts. */
  phase: number
}

const PARTICLE_COUNT = 18

/**
 * Deterministic seeded layout — same particle distribution on every
 * mount so it doesn't visually "shuffle" on re-renders.
 */
function buildParticleSpecs(width: number, height: number): ParticleSpec[] {
  const specs: ParticleSpec[] = []
  let seed = 0xa1b2c3
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0
    return (seed & 0xfffffff) / 0xfffffff
  }
  for (let i = 0; i < PARTICLE_COUNT; i++) {
    specs.push({
      x: rand() * width,
      // Spawn slightly below the visible area so the upward drift
      // brings them into view as they fade in.
      y: 12 + rand() * (height - 24),
      size: 1.5 + rand() * 2.0,
      driftX: (rand() * 2 - 1) * 16,
      driftY: -(24 + rand() * 48), // upward 24–72pt
      maxOpacity: 0.32 + rand() * 0.42,
      phase: rand(),
    })
  }
  return specs
}

/**
 * State-tinted particle field — 18 small dots distributed across the
 * card, drifting upward with a sin-bell opacity curve so each one
 * fades in, peaks, fades out. All driven by ONE shared `wave` value
 * with per-particle phase offsets, which gives the field a
 * cascading "floating embers" feel and avoids 18 independent
 * timers.
 *
 * Replaces the earlier corner blob — particles communicate the
 * card's state hue (positive=mint, caution=yellow, critical=peach)
 * across the whole surface instead of in one corner.
 */
function ParticleField({
  color,
  wave,
}: {
  color: string
  wave: SharedValue<number>
}) {
  const [size, setSize] = useState<{ width: number; height: number } | null>(
    null,
  )

  const onLayout = useCallback(
    (e: LayoutChangeEvent) => {
      const { width, height } = e.nativeEvent.layout
      if (!size || size.width !== width || size.height !== height) {
        setSize({ width, height })
      }
    },
    [size],
  )

  const specs = useMemo(() => {
    if (!size) return []
    return buildParticleSpecs(size.width, size.height)
  }, [size])

  return (
    <View
      pointerEvents="none"
      onLayout={onLayout}
      style={[
        StyleSheet.absoluteFill,
        { borderRadius: 26, overflow: 'hidden' },
      ]}
    >
      {specs.map((spec, i) => (
        <Particle key={i} spec={spec} color={color} wave={wave} />
      ))}
    </View>
  )
}

function Particle({
  spec,
  color,
  wave,
}: {
  spec: ParticleSpec
  color: string
  wave: SharedValue<number>
}) {
  const animatedStyle = useAnimatedStyle(() => {
    'worklet'
    // Per-particle phase offset → looping 0..1 t value.
    const t = (wave.value + spec.phase) % 1
    // Bell-curve opacity: 0 at endpoints, peak at t=0.5.
    // Math.sin(πt) gives 0 → 1 → 0.
    const opacity = spec.maxOpacity * Math.sin(t * Math.PI)
    return {
      transform: [
        { translateX: spec.driftX * t },
        { translateY: spec.driftY * t },
      ],
      opacity,
    }
  })

  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          left: spec.x,
          top: spec.y,
          width: spec.size,
          height: spec.size,
          borderRadius: spec.size / 2,
          backgroundColor: color,
        },
        animatedStyle,
      ]}
    />
  )
}

// ─── HintIconBadge ─────────────────────────────────────────────────

/**
 * The smart hint's leading icon badge. Subtle scale breath signals
 * that the hint is "thinking" — a live computed insight, not a
 * static label.
 */
function HintIconBadge({
  icon,
  color,
  breath,
}: {
  icon: keyof typeof MaterialIcons.glyphMap
  color: string
  breath: ReturnType<typeof useSharedValue<number>>
}) {
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: interpolate(breath.value, [0, 1], [1, 1.06]) }],
  }))

  return (
    <Animated.View
      style={[
        styles.hintIconBadge,
        {
          backgroundColor: 'rgba(255,255,255,0.10)',
          borderColor: 'rgba(255,255,255,0.18)',
        },
        animatedStyle,
      ]}
    >
      <MaterialIcons name={icon} size={14} color={color} />
    </Animated.View>
  )
}

// ─── PaceBar ───────────────────────────────────────────────────────

/**
 * Horizontal track with three layered indicators:
 *   1. Track — dark inset surface for depth.
 *   2. Fill — sheen-gradient (fillSheen → fillColor) from 0% to
 *      `spentPct`; a pulsing dot at the leading edge marks the
 *      "current spend" point with a soft glow.
 *   3. Marker — vertical line at `pacePct` extending above + below
 *      the track, topped with a floating "AHORA · HH:MM" chip with
 *      a downward triangle arrow that visually hooks into the bar.
 *
 * The eye reads the bar in one beat: filled length vs marker line.
 * The gap between them = delta vs ritmo del día.
 */
function PaceBar({
  spentPct,
  pacePct,
  chipAnchorPct,
  fillColor,
  fillSheen,
  trackBg,
  trackBorder,
  markerColor,
  markerChipBg,
  markerChipBorder,
  markerLabel,
  spentMoneyText,
  spentPctText,
  spentHasMoney,
  textPrimary,
  textBody,
  textHint,
  shimmer,
  sonar,
  fillProgress,
  markerHalo,
  ahoraFloat,
}: {
  spentPct: number
  pacePct: number
  chipAnchorPct: number
  fillColor: string
  fillSheen: string
  trackBg: string
  trackBorder: string
  markerColor: string
  markerChipBg: string
  markerChipBorder: string
  markerLabel: string
  spentMoneyText: string
  spentPctText: string
  spentHasMoney: boolean
  textPrimary: string
  textBody: string
  textHint: string
  shimmer: ReturnType<typeof useSharedValue<number>>
  sonar: ReturnType<typeof useSharedValue<number>>
  fillProgress: ReturnType<typeof useSharedValue<number>>
  markerHalo: ReturnType<typeof useSharedValue<number>>
  ahoraFloat: ReturnType<typeof useSharedValue<number>>
}) {
  // Measure the track once via onLayout so leading-edge translateX
  // can be computed from a pixel value rather than animating `left:%`.
  const [trackWidthPx, setTrackWidthPx] = useState(0)
  const handleTrackLayout = (event: LayoutChangeEvent) => {
    const w = event.nativeEvent.layout.width
    if (w > 0 && w !== trackWidthPx) setTrackWidthPx(w)
  }

  // Shimmer band: a thin highlight that travels left → right inside
  // the fill. Width is 25% of the fill; the translateX maps the
  // shimmer 0→1 to a journey from -25% to spentPct% relative to the
  // fill's left edge. Because the band lives INSIDE the fill (which
  // is itself clipped to spentPct), the shimmer only renders on the
  // filled portion — it never leaks past the leading edge.
  const shimmerStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: interpolate(shimmer.value, [0, 1], [-40, 240]) },
    ],
    opacity: interpolate(shimmer.value, [0, 0.15, 0.5, 0.85, 1], [0, 0.55, 0.7, 0.4, 0]),
  }))

  // Sonar rings — two staggered ring sprites at the leading-edge dot
  // expanding + fading on a loop. Drives "this is the live point."
  const sonarRingA = useAnimatedStyle(() => ({
    transform: [{ scale: interpolate(sonar.value, [0, 1], [0.4, 2.6]) }],
    opacity: interpolate(sonar.value, [0, 0.05, 0.5, 1], [0, 0.7, 0.18, 0]),
  }))
  const sonarRingB = useAnimatedStyle(() => {
    const v = (sonar.value + 0.5) % 1
    return {
      transform: [{ scale: interpolate(v, [0, 1], [0.4, 2.6]) }],
      opacity: interpolate(v, [0, 0.05, 0.5, 1], [0, 0.5, 0.12, 0]),
    }
  })

  // Fill bar grows from 0 to spentPct on mount; re-animates on data
  // updates. The leading-edge indicator follows the same shared
  // value so it stays visually pinned to the fill's right edge.
  //
  // Migrated from `width: %` and `left: %` (which trigger per-frame
  // layout passes on Android) to compositor-only transforms. The
  // fill is laid out at full track width and animated via `scaleX`
  // anchored to the left; the leading edge uses `translateX` against
  // the measured track width.
  const fillStyle = useAnimatedStyle(() => ({
    transform: [{ scaleX: fillProgress.value / 100 }],
  }))
  const leadingEdgeStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: (fillProgress.value / 100) * trackWidthPx }],
    opacity: interpolate(fillProgress.value, [0, 2, 6], [0, 0.4, 1]),
  }))

  // Marker halo — breathes around the marker line, emphasizing the
  // current-time mark without competing with the fill animation.
  const markerHaloStyle = useAnimatedStyle(() => ({
    transform: [
      { scaleX: interpolate(markerHalo.value, [0, 1], [0.7, 1.4]) },
      { scaleY: interpolate(markerHalo.value, [0, 1], [0.85, 1.15]) },
    ],
    opacity: interpolate(markerHalo.value, [0, 1], [0.2, 0.55]),
  }))

  // AHORA chip subtle float — ±1.5pt translateY on a 5s cycle.
  const ahoraChipStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: interpolate(ahoraFloat.value, [0, 1], [0, -2]) },
    ],
  }))

  return (
    <View style={styles.paceContainer}>
      {/* Floating "AHORA" chip with arrow, anchored above the marker */}
      <View pointerEvents="none" style={styles.paceChipRow}>
        <Animated.View
          style={[
            styles.paceChipAnchor,
            { left: `${chipAnchorPct}%` },
            ahoraChipStyle,
          ]}
        >
          <View
            style={[
              styles.paceChip,
              { backgroundColor: markerChipBg, borderColor: markerChipBorder },
            ]}
          >
            <Text
              style={[styles.paceChipText, { color: markerColor }]}
              numberOfLines={1}
            >
              {markerLabel}
            </Text>
          </View>
          <View
            style={[
              styles.paceChipArrow,
              { borderTopColor: markerChipBg },
            ]}
          />
        </Animated.View>
      </View>

      {/* Track + fill + marker line */}
      <View style={styles.paceTrackOuter}>
        <View
          onLayout={handleTrackLayout}
          style={[
            styles.paceTrack,
            { backgroundColor: trackBg, borderColor: trackBorder },
          ]}
        >
          <Animated.View
            style={[styles.paceFill, fillStyle]}
            pointerEvents="none"
          >
            <LinearGradient
              colors={[fillSheen, fillColor]}
              start={{ x: 0, y: 0 }}
              end={{ x: 0, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
            {/* Subtle inner top highlight (sheen) */}
            <View
              style={[
                styles.paceFillSheen,
                { backgroundColor: 'rgba(255,255,255,0.18)' },
              ]}
            />
            {/* Animated shimmer band traveling left → right */}
            <Animated.View
              style={[styles.paceShimmer, shimmerStyle]}
              pointerEvents="none"
            >
              <LinearGradient
                colors={[
                  'rgba(255,255,255,0)',
                  'rgba(255,255,255,0.7)',
                  'rgba(255,255,255,0)',
                ]}
                locations={[0, 0.5, 1]}
                start={{ x: 0, y: 0.5 }}
                end={{ x: 1, y: 0.5 }}
                style={StyleSheet.absoluteFill}
              />
            </Animated.View>
          </Animated.View>
        </View>

        {/* Pulsing leading-edge indicator — follows the fill's
            animated edge so it stays pinned to the right border of
            the spent portion as the fill grows on mount. */}
        <Animated.View
          pointerEvents="none"
          style={[styles.paceLeadingEdge, leadingEdgeStyle]}
        >
          {/* Sonar rings — two staggered expansions */}
          <Animated.View
            style={[
              styles.paceSonarRing,
              { borderColor: hexAlpha(fillColor, 0.65) },
              sonarRingA,
            ]}
          />
          <Animated.View
            style={[
              styles.paceSonarRing,
              { borderColor: hexAlpha(fillColor, 0.55) },
              sonarRingB,
            ]}
          />
          {/* Static glow halo + the dot itself */}
          <View
            style={[
              styles.paceLeadingGlow,
              { backgroundColor: hexAlpha(fillColor, 0.35) },
            ]}
          />
          <View
            style={[
              styles.paceLeadingDot,
              { backgroundColor: fillColor, borderColor: 'rgba(255,255,255,0.85)' },
            ]}
          />
        </Animated.View>

        {/* Marker halo — soft pulse behind the marker line. Lives
            below the line in the z-order so the line stays sharp on
            top of the breathing glow. */}
        <Animated.View
          pointerEvents="none"
          style={[
            styles.paceMarkerHalo,
            {
              left: `${pacePct}%`,
              backgroundColor: hexAlpha(markerColor, 0.45),
            },
            markerHaloStyle,
          ]}
        />

        {/* Marker line — extends above and below the track */}
        <View
          pointerEvents="none"
          style={[
            styles.paceMarkerLine,
            { left: `${pacePct}%`, backgroundColor: markerColor },
          ]}
        />
      </View>

      {/* Combined label below the bar */}
      <View style={styles.paceLabelRow}>
        <View
          style={[
            styles.paceDot,
            {
              backgroundColor: spentHasMoney ? fillColor : 'transparent',
              borderColor: spentHasMoney ? 'transparent' : textHint,
              borderWidth: spentHasMoney ? 0 : 1.5,
            },
          ]}
        />
        <Text
          style={[
            styles.paceLabelMain,
            { color: spentHasMoney ? textPrimary : textBody },
          ]}
        >
          {spentMoneyText}
        </Text>
        <Text style={[styles.paceLabelSep, { color: textHint }]}>·</Text>
        <Text style={[styles.paceLabelMuted, { color: textBody }]}>
          {spentPctText}
        </Text>
      </View>
    </View>
  )
}

// ─── StatChip ──────────────────────────────────────────────────────

/**
 * Card-tile stat — three rows stacked left-aligned: icon (small,
 * decorative), value (dominant, tabular), caption (uppercase, full
 * width). Each row gets its own line, so captions never compete with
 * the icon for horizontal space and never truncate.
 *
 * Used by the HOY card's bottom stats strip ("Racha", "Bajo cupo",
 * "Al cobro"). The icon hue carries category identity (warm /
 * mint / peach), the value is the headline, the caption labels what
 * the value means.
 */
function StatChip({
  icon,
  iconColor,
  label,
  caption,
  text,
  minor,
  background,
  border,
}: {
  icon: keyof typeof MaterialIcons.glyphMap
  iconColor: string
  label: string
  caption: string
  text: string
  minor: string
  background: string
  border: string
}) {
  return (
    <View
      style={[
        styles.statChip,
        { backgroundColor: background, borderColor: border },
      ]}
    >
      <MaterialIcons name={icon} size={16} color={iconColor} />
      <Text style={[styles.statChipLabel, { color: text }]} numberOfLines={1}>
        {label}
      </Text>
      <Text
        style={[styles.statChipCaption, { color: minor }]}
        numberOfLines={1}
      >
        {caption}
      </Text>
    </View>
  )
}

// ─── Styles ────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  card: {
    borderRadius: 26,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(199,238,156,0.14)',
    overflow: 'hidden',
  },
  topHighlight: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.10)',
  },

  // Header
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  eyebrowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  eyebrow: {
    fontSize: 11,
    letterSpacing: 1.6,
    fontWeight: '700',
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  statusPillText: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.3,
  },

  // Hero stat
  heroStat: {
    marginTop: 16,
  },
  heroEyebrow: {
    fontSize: 10,
    letterSpacing: 1.6,
    fontWeight: '800',
  },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
    marginTop: 4,
  },
  heroAmount: {
    fontSize: 38,
    fontWeight: '800',
    letterSpacing: -1.4,
    lineHeight: 40,
    fontVariant: ['tabular-nums'],
  },
  deltaTag: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 4, // align bottom roughly with marquee baseline
    gap: 1,
  },
  deltaTagAmountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  deltaTagAmount: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: -0.1,
    fontVariant: ['tabular-nums'],
  },
  deltaTagCaption: {
    fontSize: 8.5,
    fontWeight: '800',
    letterSpacing: 0.7,
    textAlign: 'center',
  },
  heroSub: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 4,
  },

  // Pace bar
  paceContainer: {
    marginTop: 24, // extra room for the floating chip above the bar
  },
  paceChipRow: {
    height: 32, // reserves vertical space for the chip + arrow
    position: 'relative',
  },
  paceChipAnchor: {
    position: 'absolute',
    bottom: 0,
    width: 110,
    marginLeft: -55, // half of width — centers the chip on the anchor pct
    alignItems: 'center',
  },
  paceChip: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
  },
  paceChipText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.6,
    fontVariant: ['tabular-nums'],
  },
  paceChipArrow: {
    width: 0,
    height: 0,
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderTopWidth: 6,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    marginTop: -1,
  },
  paceTrackOuter: {
    height: 22, // accommodates the 14pt track + marker overhang
    justifyContent: 'center',
    position: 'relative',
    marginTop: 4,
  },
  paceTrack: {
    height: 14,
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 1,
  },
  paceFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    // Lay out at full track width and animate via `scaleX` (compositor)
    // instead of `width:%` (per-frame layout pass on Android).
    width: '100%',
    transformOrigin: 'left' as const,
    borderRadius: 8,
  },
  paceFillSheen: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    height: 4,
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
  },
  paceShimmer: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    width: 80,
    borderRadius: 8,
  },
  paceSonarRing: {
    position: 'absolute',
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 1.5,
  },
  paceLeadingEdge: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    width: 14,
    // -7 centers the 14pt indicator on the fill's right edge; the
    // animated `translateX` (in the worklet style) then rides it
    // along the track based on `fillProgress`.
    marginLeft: -7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  paceLeadingGlow: {
    position: 'absolute',
    width: 18,
    height: 18,
    borderRadius: 9,
  },
  paceLeadingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    borderWidth: 1.5,
  },
  paceMarkerLine: {
    position: 'absolute',
    top: -3,
    bottom: -3,
    width: 3,
    borderRadius: 2,
    marginLeft: -1.5,
  },
  paceMarkerHalo: {
    position: 'absolute',
    top: -8,
    bottom: -8,
    width: 14,
    borderRadius: 8,
    marginLeft: -7,
  },
  paceLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
  },
  paceDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  paceLabelMain: {
    fontSize: 12.5,
    fontWeight: '800',
    letterSpacing: -0.2,
    fontVariant: ['tabular-nums'],
  },
  paceLabelSep: {
    fontSize: 11,
    fontWeight: '700',
  },
  paceLabelMuted: {
    fontSize: 11.5,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },

  // Stats row
  statsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 16,
  },
  statChipFlex: {
    flex: 1,
  },
  statChip: {
    flex: 1,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 11,
    borderRadius: 14,
    borderWidth: 1,
    gap: 6,
  },
  statChipLabel: {
    fontSize: 19,
    fontWeight: '800',
    letterSpacing: -0.4,
    fontVariant: ['tabular-nums'],
    marginTop: 2,
  },
  statChipCaption: {
    fontSize: 9.5,
    fontWeight: '800',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },

  // Hint
  hintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingLeft: 12, // 3pt stripe + 9pt breathing room before badge
    paddingRight: 12,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1,
    marginTop: 10,
    overflow: 'hidden',
  },
  hintAccent: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 3,
  },
  hintIconBadge: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  hintText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
  },
})
