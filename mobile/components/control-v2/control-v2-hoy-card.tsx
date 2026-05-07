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
import { useUnboundedLoopAnimation } from '@/hooks/use-unbounded-loop-animation'
import { formatMoney } from '@/utils/money'
import { useAppTheme } from '@/theme/theme-provider'
import {
  getStateTokens,
  hexAlpha,
  type SemanticState,
} from '@/theme/state-tokens'
import { decorativeDurations, motionEasings } from '@/lib/motion/tokens'

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
  /** User's self-imposed daily goal (in currency), or `null` when
   *  no goal is set. When provided, the card escalates to `caution`
   *  the moment `gastoHoy` crosses this threshold — even though the
   *  real cupo still has headroom. The META tick on the pace bar
   *  marks the goal position so the user can read the gap visually.
   *  `critical` remains anchored to the real cupo. */
  dailyGoalAmount?: number | null
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
  dailyGoalAmount = null,
}: ControlV2HoyCardProps) {
  const { theme } = useAppTheme()

  // ── Daily-goal awareness ────────────────────────────────────────
  // The user can opt into a personal daily ceiling (`dailyGoalAmount`)
  // below the real cupo. When active, the card treats the goal as the
  // primary "positive→caution" threshold:
  //   · gastoHoy ≤ goal       → positive (mint, on-target)
  //   · goal < gastoHoy ≤ cupo → caution (yellow, sobre tu meta but
  //                              still within the real cupo)
  //   · gastoHoy > cupo       → critical (peach, hard ceiling broken)
  //
  // We require `goal < cupoDiario`: if the user accidentally lands in
  // a state where the goal isn't strictly below the cupo (no buffer
  // configured / floored math), there's nothing to escalate to.
  const goalActive =
    dailyGoalAmount != null &&
    Number.isFinite(dailyGoalAmount) &&
    dailyGoalAmount > 0 &&
    dailyGoalAmount < cupoDiario
  const overGoal = goalActive && gastoHoy > (dailyGoalAmount as number)

  const state: SemanticState = alreadyExhausted
    ? 'critical'
    : libreHoy <= 0
      ? 'critical'
      : overGoal
        ? 'caution'
        : estaOk
          ? 'positive'
          : 'caution'

  // When the caution is goal-driven (not pace-driven), upgrade the
  // pill copy from the generic "Atención" to a more specific
  // "Sobre tu meta" — the user instantly understands which threshold
  // they crossed. Pace-driven caution keeps the original token label
  // so we don't mislead users without a goal active.
  const cautionFromGoal = overGoal && state === 'caution'

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
  // META tick position on the bar — only when goal is active. We
  // clamp to [4, 96] so the tick + mini-label never collide with
  // the bar's rounded corners. Reading is `(goal/cupo) × 100`.
  const goalPct = goalActive
    ? clamp(((dailyGoalAmount as number) / Math.max(1, cupoDiario)) * 100, 4, 96)
    : null
  // Clamp the floating chip's horizontal anchor so the chip never
  // gets clipped at the bar edges. The marker line itself uses the
  // raw `pacePct` — only the chip+arrow composite is constrained.
  const chipAnchorPct = clamp(pacePct, 12, 88)

  const deltaPositive = delta >= 0
  const deltaIcon: keyof typeof MaterialIcons.glyphMap = deltaPositive
    ? 'trending-down'
    : 'trending-up'
  const deltaSign = deltaPositive ? '+' : '−'

  // ── Hero stat — goal-aware hierarchy ───────────────────────────
  // When a personal goal is active, the hero number flips from
  // "available against cupo real" to "available against your goal".
  // The cupo real is demoted to a smaller secondary line below — the
  // user reads their own ceiling first, with the absolute cupo as
  // context. When the user crosses the goal, the eyebrow shifts to
  // "META EXCEDIDA" and the big number becomes the overshoot amount.
  // Cupo-overshoot (libreHoy ≤ 0) keeps "CUPO EXCEDIDO" as the
  // top-priority frame regardless of goal state.
  const overGoalAmount = goalActive
    ? Math.max(0, gastoHoy - (dailyGoalAmount as number))
    : 0
  const remainingVsGoal = goalActive
    ? Math.max(0, (dailyGoalAmount as number) - gastoHoy)
    : 0
  const heroDescriptor: {
    eyebrow: string
    amount: number
    /** Optional sign prefix (e.g. "−" for overshoot) — applied at
     *  format time so CountUpText still animates the magnitude. */
    sign: '' | '−'
    subText: string
  } = (() => {
    if (libreHoy <= 0) {
      return {
        eyebrow: 'CUPO EXCEDIDO',
        amount: Math.abs(libreHoy),
        sign: '−',
        subText: goalActive
          ? `Pasaste tu meta y el cupo real ${formatMoney(cupoDiario)}`
          : `de ${formatMoney(cupoDiario)} cupo del día`,
      }
    }
    if (overGoal && goalActive) {
      return {
        eyebrow: 'META EXCEDIDA',
        amount: overGoalAmount,
        sign: '−',
        subText: `Te quedan ${formatMoney(libreHoy)} del cupo real`,
      }
    }
    if (goalActive) {
      return {
        eyebrow: 'PARA TU META HOY',
        amount: remainingVsGoal,
        sign: '',
        subText: `Cupo real ${formatMoney(cupoDiario)}`,
      }
    }
    return {
      eyebrow: 'DISPONIBLE HOY',
      amount: libreHoy,
      sign: '',
      subText: `de ${formatMoney(cupoDiario)} cupo del día`,
    }
  })()

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
    overGoal,
    dailyGoalAmount,
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
  // Hero-card decorative loops (shimmer / sonar / particles / halo).
  // Use unbounded variant — these must keep running even when the
  // Asistente screen blurs (Stack `freezeOnBlur: true` was leaving
  // them cancelled and not restarting cleanly on focus return).
  useUnboundedLoopAnimation(
    () => {
      shimmer.value = withRepeat(
        withSequence(
          // @motion-allow: 3200ms slow shimmer sweep on hoy-card; shimmer token (1400) reads too aggressive here
          withTiming(1, { duration: 3200, easing: motionEasings.warm }),
          // @motion-allow: instant 0ms reset of shimmer position at end of sweep
          withTiming(0, { duration: 0 }),
        ),
        -1,
        false,
      )
      sonar.value = withRepeat(
        withSequence(
          withTiming(1, { duration: decorativeDurations.pulseSlow, easing: motionEasings.decelerate }),
          // @motion-allow: instant 0ms reset of sonar at end of cycle
          withTiming(0, { duration: 0 }),
        ),
        -1,
        false,
      )
      // Single shared wave that drives the particle field. 9s linear
      // sweep, looped with instant reset. The instant 1→0 snap is
      // visually invisible because every Particle worklet uses sin/cos
      // at integer frequency multipliers of `wave * 2π` — both position
      // and velocity match across the wrap.
      particleWave.value = withRepeat(
        withSequence(
          withTiming(1, { duration: decorativeDurations.ambient, easing: Easing.linear }),
          // @motion-allow: instant 0ms reset of particle wave at end of cycle
          withTiming(0, { duration: 0 }),
        ),
        -1,
        false,
      )
      // Marker halo — 3.6s breath.
      markerHalo.value = withRepeat(
        withSequence(
          withTiming(1, { duration: decorativeDurations.halo, easing: Easing.inOut(Easing.sin) }),
          withTiming(0, { duration: decorativeDurations.halo, easing: Easing.inOut(Easing.sin) }),
        ),
        -1,
        false,
      )
      // AHORA chip subtle float — 5s, ±1.5pt translateY.
      ahoraFloat.value = withRepeat(
        withSequence(
          withTiming(1, { duration: decorativeDurations.pulseSlow, easing: Easing.inOut(Easing.sin) }),
          withTiming(0, { duration: decorativeDurations.pulseSlow, easing: Easing.inOut(Easing.sin) }),
        ),
        -1,
        false,
      )
      // Hint icon badge breath — 5s, scale 1.0 ↔ 1.06.
      hintBreath.value = withRepeat(
        withSequence(
          withTiming(1, { duration: decorativeDurations.pulseSlow, easing: Easing.inOut(Easing.sin) }),
          withTiming(0, { duration: decorativeDurations.pulseSlow, easing: Easing.inOut(Easing.sin) }),
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
      // @motion-allow: 1000ms fill-bar growth; deliberately slower than pulse (1200) for smooth value-tracking feel
      withTiming(spentPct, { duration: 1000, easing: motionEasings.decelerate }),
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
              <MaterialIcons
                name={cautionFromGoal ? 'flag' : tokens.icon}
                size={14}
                color={stateBright}
              />
              <Text style={[styles.statusPillText, { color: stateBright }]}>
                {cautionFromGoal ? 'Sobre tu meta' : tokens.label}
              </Text>
            </View>
          </View>

          {/* ── Hero stat ── */}
          <View style={styles.heroStat}>
            <Text style={[styles.heroEyebrow, { color: textBody }]}>
              {heroDescriptor.eyebrow}
            </Text>
            <View style={styles.amountRow}>
              <CountUpText
                value={Math.max(0, heroDescriptor.amount)}
                duration={1200}
                format={(n) => `${heroDescriptor.sign}${formatMoney(n)}`}
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
            {goalActive && libreHoy > 0 && !alreadyExhausted ? (
              // Goal-aware path: render the cupo real reference as
              // a mint-tinted chip so the absolute number reads as
              // a coherent secondary anchor next to the big META
              // amount, not as throwaway grey copy. Wallet icon
              // grounds the chip semantically; the tint reuses the
              // hero accent so it threads visually with the eyebrow
              // above and the META tick on the bar below.
              <View
                style={[
                  styles.heroSubChip,
                  {
                    backgroundColor: hexAlpha(heroAccent, 0.16),
                    borderColor: hexAlpha(heroAccent, 0.42),
                  },
                ]}
              >
                <MaterialIcons
                  name="account-balance-wallet"
                  size={11}
                  color={heroAccent}
                />
                <Text
                  style={[styles.heroSubChipText, { color: heroAccent }]}
                  numberOfLines={1}
                >
                  {heroDescriptor.subText}
                </Text>
              </View>
            ) : (
              <Text style={[styles.heroSub, { color: textBody }]}>
                {heroDescriptor.subText}
              </Text>
            )}
          </View>

          {/* ── Pace bar ── */}
          <PaceBar
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
            goalPct={goalPct}
            goalReached={overGoal}
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
  /** Whether the user has crossed their personal daily goal (goal
   *  active and `gastoHoy > goalAmount`). Drives a dedicated hint
   *  that explains what `caution` means in goal terms. */
  overGoal: boolean
  /** The personal daily goal amount, included in copy. */
  dailyGoalAmount: number | null
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
  // Goal-overshoot hint takes precedence over generic caution copy.
  // The user crossed their personal threshold but still has cupo
  // headroom; we surface the exact remaining margin so the rest of
  // the day is actionable, not just labelled as "Atención".
  if (i.overGoal && i.dailyGoalAmount != null) {
    return {
      icon: 'flag',
      text: `Pasaste tu meta de ${formatMoney(i.dailyGoalAmount)}. Te quedan ${formatMoney(
        Math.max(0, i.libreHoy),
      )} del cupo real.`,
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
  /** Integer frequency multiplier for x motion. */
  fx: 1 | 2
  /** Integer frequency multiplier for y motion. */
  fy: 1 | 2
  /** Integer frequency multiplier for brightness flicker. */
  fb: 1 | 2 | 3
  /** Phase offset for x sine (radians). */
  phaseX: number
  phaseY: number
  phaseB: number
  /** Per-particle motion amplitudes (px). */
  ampX: number
  ampY: number
  /** Brightness ceiling at the flicker peak. */
  brightCeil: number
}

const PARTICLE_COUNT = 18

// Brightness floor + peak tuned for the dark hero gradient. Floor > 0
// so each ember keeps a faint glow at all times (firefly behaviour;
// audit feedback was "deben fluir naturalmente como luciernagas").
const BRIGHT_FLOOR = 0.18
const BRIGHT_PEAK = 0.92

/**
 * Deterministic seeded layout — same particle distribution on every
 * mount so it doesn't visually "shuffle" on re-renders.
 *
 * Motion model: each particle uses sin/cos at integer frequency
 * multipliers of the shared `wave * 2π`. Because integer × 2π wraps
 * exactly at wave=1→0, both position AND velocity match across the
 * loop boundary — no visible "salto a su posición" the way the old
 * `drift * t` ramp produced.
 */
function buildParticleSpecs(width: number, height: number): ParticleSpec[] {
  const specs: ParticleSpec[] = []
  let seed = 0xa1b2c3
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0
    return (seed & 0xfffffff) / 0xfffffff
  }
  const TWO_PI = Math.PI * 2
  for (let i = 0; i < PARTICLE_COUNT; i++) {
    specs.push({
      x: rand() * width,
      y: 12 + rand() * (height - 24),
      size: 1.8 + rand() * 2.2,
      fx: (i % 3 === 0 ? 2 : 1) as 1 | 2,
      fy: (i % 2 === 0 ? 1 : 2) as 1 | 2,
      fb: (1 + (i % 3)) as 1 | 2 | 3,
      phaseX: rand() * TWO_PI,
      phaseY: rand() * TWO_PI,
      phaseB: rand() * TWO_PI,
      // Slightly larger than the previous linear-drift amplitudes —
      // sin motion stays inside ±amp while linear drifted up to full
      // `driftY`, so we widen here to keep the visible motion range.
      ampX: 10 + rand() * 12,
      ampY: 14 + rand() * 18,
      brightCeil: Math.min(BRIGHT_PEAK, BRIGHT_FLOOR + 0.55 + rand() * 0.25),
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
    const angle = wave.value * 2 * Math.PI
    const tx = Math.sin(angle * spec.fx + spec.phaseX) * spec.ampX
    const ty = Math.cos(angle * spec.fy + spec.phaseY) * spec.ampY
    // Brightness flicker — independent frequency from motion so the
    // ember reads as breathing, not strobing in lockstep.
    const flicker01 = (Math.sin(angle * spec.fb + spec.phaseB) + 1) / 2
    const opacity =
      BRIGHT_FLOOR + flicker01 * (spec.brightCeil - BRIGHT_FLOOR)
    return {
      transform: [{ translateX: tx }, { translateY: ty }],
      opacity,
    }
  })

  // Soft halo so each ember reads as a point of light — bumped per
  // request to "que brillen un poco más". Halo radius scales with the
  // particle so larger embers naturally glow stronger.
  const glowRadius = spec.size * 2.6
  const glow = `0px 0px ${glowRadius.toFixed(1)}px ${color}`

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
          boxShadow: glow,
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
  goalPct,
  goalReached,
}: {
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
  /** Position (0-100) of the user's daily-goal threshold on the bar.
   *  When `null`, no META tick is rendered. */
  goalPct: number | null
  /** Whether the spent fill has crossed the goal — drives the tick's
   *  visual treatment (dashed when ahead of goal, solid when crossed)
   *  so the user reads the threshold at a glance. */
  goalReached: boolean
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
          {/* Goal-buffer segmentation — when a personal goal is
              active, the track segment BEYOND the goal gets a soft
              mint tint. This always-visible cue tells the user "that
              far-right slice is your buffer" even on $0-spent days,
              giving the goal a constant visual presence without
              shouting. Sits beneath the fill so the fill paints over
              it as it grows; clipped by the track's rounded corners. */}
          {goalPct != null ? (
            <View
              pointerEvents="none"
              style={[
                styles.paceGoalBuffer,
                {
                  left: `${goalPct}%`,
                  // Higher alpha (0.22) than first pass (0.14): the
                  // base track is rgba(0,0,0,0.50), which crushes
                  // low-alpha mint into "barely there". 0.22 lifts
                  // the buffer zone to clearly readable on the
                  // dark hero gradient without competing with the
                  // fill that paints over it.
                  backgroundColor: hexAlpha(markerColor, 0.22),
                  borderLeftWidth: StyleSheet.hairlineWidth,
                  borderLeftColor: hexAlpha(markerColor, 0.55),
                },
              ]}
            />
          ) : null}
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

        {/* META tick — single thin vertical line living STRICTLY
            inside the track (top:4 to bottom:4 in paceTrackOuter
            coords, matching the track's centered position). Stays
            within the track bounds so it never collides with the
            AHORA marker halo above/below or the chip arrow even
            when goalPct ≈ chipAnchorPct. Pre-cross: semi-transparent
            mint so it reads as a "soft target". Post-cross
            (goalReached): solid bright mint to confirm the
            threshold was breached. */}
        {goalPct != null ? (
          <View
            pointerEvents="none"
            style={[
              styles.paceGoalTick,
              {
                left: `${goalPct}%`,
                backgroundColor: goalReached
                  ? markerColor
                  : hexAlpha(markerColor, 0.9),
              },
            ]}
          />
        ) : null}

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
  // Hero sub chip — pill-shaped container that highlights the
  // "Cupo real $X" reference when a personal goal is active. The
  // mint tint visually anchors it to the goal's accent so the user
  // reads it as "the absolute number that lives behind your goal",
  // not as throwaway sub-text. Self-aligned to the start so the
  // chip hugs its content instead of stretching across the row.
  heroSubChip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    marginTop: 6,
  },
  heroSubChipText: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.1,
    fontVariant: ['tabular-nums'],
  },

  // Pace bar
  paceContainer: {
    // Trimmed from 24pt → 10pt: the AHORA chip's own paceChipRow
    // (height 32) already reserves vertical space for the floating
    // chip + its arrow, so the extra cushion above was creating a
    // dead-air pocket between the hero sub line and the bar without
    // serving any layout function.
    marginTop: 10,
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
  // META tick — strictly contained INSIDE the track (top:4 = track
  // top edge in paceTrackOuter, bottom:4 = track bottom edge). Never
  // extends above/below the track so it can't collide with the AHORA
  // marker halo or chip arrow even when goalPct ≈ chipAnchorPct.
  paceGoalTick: {
    position: 'absolute',
    top: 4,
    bottom: 4,
    width: 1.5,
    marginLeft: -0.75,
  },
  // Buffer-zone overlay — segments the track at goalPct so the area
  // beyond the goal reads as "extra room past your personal ceiling".
  // Lives inside the track (so the fill paints over it); clipped by
  // the track's rounded corners.
  paceGoalBuffer: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    right: 0,
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
