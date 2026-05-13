import { useEffect } from 'react'
import { ScrollView, StyleSheet, Text, View } from 'react-native'
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated'
import { LinearGradient } from 'expo-linear-gradient'
import { MaterialIcons } from '@expo/vector-icons'
import { BreatheDot } from '@/components/home/animated/breathe-dot'
import { CountUpText } from '@/components/home/animated/count-up-text'
import { ShineOverlay } from '@/components/home/animated/shine-overlay'
import { CardParticles } from '@/components/ui/card-particles'
import { useReducedMotion } from '@/hooks/use-reduced-motion'
import { motionEasings } from '@/lib/motion/tokens'
import { formatMoney } from '@/utils/money'
import { authTokens } from '@/theme/palette'
import { useAppTheme } from '@/theme/theme-provider'
import {
  buildControlHeroPalette,
  resolveControlMessage,
  statusColor,
} from './control-hero-helpers'
import type { ControlHeroState } from './control-hero-states'

const ENTER = motionEasings.enterSmooth

interface Props {
  state: ControlHeroState
}

/**
 * Variant G · Coach × Magazine fusion. Combina el tono conversacional
 * de El Coach ("Hoy te digo:") con la estructura editorial de El
 * Periódico (masthead + score badge + ticker). Showcasea TODOS los
 * chips state-aware: meta diaria · racha · momentum · ganadores ·
 * no-spend · próximo fijo · vencidos · score · cobro · días-agotado.
 *
 * La ÚNICA variante que muestra el comportamiento del hero con TODA
 * la data del controller real cuando llegue producción.
 */
export function ControlHeroCoachMagazine({ state }: Props) {
  const { theme } = useAppTheme()
  const palette = buildControlHeroPalette()
  const msg = resolveControlMessage(state)
  const tone = statusColor(msg.status, palette)
  const reduced = useReducedMotion()

  // Coach avatar spring bounce-in
  const avatarScale = useSharedValue(reduced ? 1 : 0.7)
  useEffect(() => {
    if (reduced) return
    avatarScale.value = withDelay(
      200,
      withSpring(1, { damping: 12, stiffness: 220, mass: 0.7 }),
    )
    return () => cancelAnimation(avatarScale)
  }, [reduced, avatarScale])
  const avatarStyle = useAnimatedStyle(() => ({
    transform: [{ scale: avatarScale.value }],
  }))

  return (
    <LinearGradient
      colors={[...theme.colors.heroGradient] as unknown as readonly [string, string, ...string[]]}
      start={{ x: 0.1, y: 0 }}
      end={{ x: 0.9, y: 1 }}
      style={[styles.card, { borderColor: 'rgba(166,239,143,0.12)' }]}
    >
      <ShineOverlay width={430} height={420} tint={theme.colors.shineOverlay} delayMs={1000} periodMs={4200} />
      <CardParticles count={14} accentColor={authTokens.peach} />

      {/* MASTHEAD · Magazine flavor · brand + fecha + score badge */}
      <RiseRow delay={0}>
        <View style={styles.masthead}>
          <View style={styles.brandRow}>
            <BreatheDot size={6} color={tone} glow={tone} />
            <Text style={[styles.brand, { color: theme.colors.heroAccent }]}>
              CONTROL
            </Text>
            <Text style={[styles.mastheadDate, { color: theme.colors.heroMuted2 }]}>
              · {state.diaLabel}
            </Text>
          </View>
          <ScoreBadge
            score={state.score}
            label={state.scoreLabel}
            tone={tone}
            cream={theme.colors.heroText}
          />
        </View>
      </RiseRow>

      <RuleScale color={tone} delay={80} />

      {/* COACH lead · avatar + "Hoy te digo:" */}
      <RiseRow delay={160}>
        <View style={styles.coachRow}>
          <Animated.View
            style={[
              styles.coachAvatar,
              {
                backgroundColor: 'rgba(166,239,143,0.18)',
                borderColor: tone,
              },
              avatarStyle,
            ]}
          >
            <MaterialIcons name="psychology" size={18} color={tone} />
          </Animated.View>
          <Text style={[styles.coachIntro, { color: theme.colors.heroMuted }]}>
            Hoy te digo:
          </Text>
        </View>
      </RiseRow>

      {/* HEADLINE · state-aware */}
      <RiseRow delay={240}>
        <Text style={[styles.headline, { color: theme.colors.heroText }]}>
          {msg.primary}
        </Text>
      </RiseRow>

      {/* LEAD paragraph · italic editorial */}
      <RiseRow delay={320}>
        <Text style={[styles.lead, { color: theme.colors.heroMuted }]}>
          {msg.secondary}
        </Text>
      </RiseRow>

      {/* PRIMARY NUMBER · big */}
      <RiseRow delay={400}>
        <View style={styles.numberBlock}>
          <Text style={[styles.numberLabel, { color: theme.colors.heroMuted2 }]}>
            {msg.primaryLabel}
          </Text>
          <CountUpText
            value={msg.primaryNumber}
            duration={1000}
            format={(n) => formatPrimaryNumber(n, msg.primaryLabel)}
            style={[styles.numberValue, { color: tone }]}
          />
        </View>
      </RiseRow>

      {/* CHIPS state-aware · horizontal scrollable · TODO disponible */}
      <RiseRow delay={480}>
        <ChipsRow state={state} palette={palette} cream={theme.colors.heroText} muted={theme.colors.heroMuted} muted2={theme.colors.heroMuted2} />
      </RiseRow>

      {/* TICKER footer · Magazine flavor · 4 mini stats */}
      <RiseRow delay={560}>
        <View style={[styles.tickerRow, { borderTopColor: 'rgba(255,255,255,0.10)' }]}>
          <TickerItem
            label="COBRO"
            value={`${state.proximoSueldoEnDias}d`}
            tone={theme.colors.heroText}
          />
          <TickerItem
            label="CUPO/DÍA"
            value={`$${Math.round(state.cupoDiario / 1000)}k`}
            tone={theme.colors.heroText}
          />
          <TickerItem
            label="DELTA"
            value={`${state.delta >= 0 ? '+' : ''}${Math.round(state.delta / 1000)}k`}
            tone={state.delta >= 0 ? palette.positive : palette.urgent}
          />
          <TickerItem
            label="MOMENTUM"
            value={`${state.momentum > 1 ? '↑' : state.momentum < 1 ? '↓' : '='}${Math.round(Math.abs(state.momentum - 1) * 100)}%`}
            tone={state.momentum > 1.08 ? palette.urgent : state.momentum < 0.92 ? palette.positive : theme.colors.heroMuted}
          />
        </View>
      </RiseRow>
    </LinearGradient>
  )
}

function formatPrimaryNumber(n: number, label: string): string {
  if (label === 'DÍAS HASTA AGOTAR') return `${Math.round(n)} días`
  return formatMoney(Math.round(n))
}

// ── Score badge in the masthead ─────────────────────────────────────

function ScoreBadge({
  score,
  label,
  tone,
  cream,
}: {
  score: number
  label: string
  tone: string
  cream: string
}) {
  const iconName: 'trending-up' | 'trending-flat' | 'trending-down' =
    score >= 65 ? 'trending-up' : score >= 35 ? 'trending-flat' : 'trending-down'
  return (
    <View
      style={[
        styles.scoreBadge,
        {
          backgroundColor: 'rgba(15,42,30,0.32)',
          borderColor: tone + '60',
        },
      ]}
    >
      <MaterialIcons name={iconName} size={11} color={tone} />
      <Text style={[styles.scoreBadgeValue, { color: tone }]}>{score}</Text>
      <Text style={[styles.scoreBadgeLabel, { color: cream }]}>· {label}</Text>
    </View>
  )
}

// ── Chips row · state-aware · TODO disponible ───────────────────────

interface ChipsRowProps {
  state: ControlHeroState
  palette: ReturnType<typeof buildControlHeroPalette>
  cream: string
  muted: string
  muted2: string
}

function ChipsRow({ state, palette, cream, muted, muted2 }: ChipsRowProps) {
  void muted
  // Compute chip list dinámica · cada chip aparece solo cuando aplica.
  const chips: ChipDef[] = []

  // 1. Meta diaria auto-impuesta · alta prioridad cuando existe
  if (state.dailyGoalAmount != null) {
    const overGoal = state.gastoHoy > state.dailyGoalAmount
    chips.push({
      icon: 'flag',
      label: 'Meta',
      value: `$${Math.round(state.dailyGoalAmount / 1000)}k/día`,
      tone: overGoal ? palette.urgent : palette.positive,
    })
  }

  // 2. Vencidos · siempre relevante cuando hay
  if ((state.fijosVencidos ?? 0) > 0) {
    chips.push({
      icon: 'warning',
      label: 'Vencidos',
      value: `${state.fijosVencidos}`,
      tone: palette.urgent,
    })
  }

  // 3. Exhausto · pasado del ciclo
  if (state.alreadyExhausted) {
    chips.push({
      icon: 'block',
      label: 'Pasaste',
      value: 'el ciclo',
      tone: palette.urgent,
    })
  }

  // 4. Día de agotamiento · cuando NO alcanza al cobro
  if (!state.alcanzaElMes && state.diaAgotamiento < state.diasMes) {
    chips.push({
      icon: 'event-busy',
      label: 'Sin plata',
      value: `día ${state.diaAgotamiento}`,
      tone: palette.urgent,
    })
  }

  // 5. Racha · solo cuando es ≥ 3
  if (state.racha >= 3) {
    chips.push({
      icon: 'whatshot',
      label: 'Racha',
      value: `${state.racha}d`,
      tone: palette.positive,
    })
  }

  // 6. Días ganadores · solo cuando hay historial (≥ 7 días)
  if (state.closedDays >= 7) {
    chips.push({
      icon: 'emoji-events',
      label: 'Ganadores',
      value: `${state.diasGanadores}/${state.closedDays}`,
      tone: state.diasGanadores / state.closedDays >= 0.6 ? palette.positive : muted2,
    })
  }

  // 7. No-spend · solo cuando > 0
  if (state.noSpendCount > 0) {
    chips.push({
      icon: 'savings',
      label: 'Sin gasto',
      value: `${state.noSpendCount}d`,
      tone: palette.positive,
    })
  }

  // 8. Próximo fijo · siempre que exista
  if (state.proximoFijo) {
    const days = state.proximoFijo.days
    const dayCopy = days === 0 ? 'hoy' : days === 1 ? 'mañana' : `${days}d`
    chips.push({
      icon: 'schedule',
      label: state.proximoFijo.name,
      value: dayCopy,
      tone: days <= 1 ? palette.urgent : cream,
    })
  }

  if (chips.length === 0) {
    return (
      <Text style={[styles.chipsEmpty, { color: muted2 }]}>
        Aún sin métricas · seguí cargando gastos.
      </Text>
    )
  }

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.chipsContent}
      style={styles.chipsScroll}
    >
      {chips.map((chip, idx) => (
        <Chip key={`${chip.label}-${idx}`} chip={chip} />
      ))}
    </ScrollView>
  )
}

interface ChipDef {
  icon: 'flag' | 'warning' | 'block' | 'event-busy' | 'whatshot' | 'emoji-events' | 'savings' | 'schedule'
  label: string
  value: string
  tone: string
}

function Chip({ chip }: { chip: ChipDef }) {
  return (
    <View
      style={[
        styles.chip,
        {
          backgroundColor: chip.tone + '24',
          borderColor: chip.tone + '60',
        },
      ]}
    >
      <MaterialIcons name={chip.icon} size={11} color={chip.tone} />
      <Text style={[styles.chipValue, { color: chip.tone }]}>{chip.value}</Text>
      <Text style={[styles.chipLabel, { color: chip.tone, opacity: 0.78 }]}>
        · {chip.label}
      </Text>
    </View>
  )
}

// ── Ticker footer · Magazine flavor ─────────────────────────────────

function TickerItem({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone: string
}) {
  const { theme } = useAppTheme()
  return (
    <View style={styles.tickerCol}>
      <Text style={[styles.tickerLabel, { color: theme.colors.heroMuted2 }]}>
        {label}
      </Text>
      <Text style={[styles.tickerValue, { color: tone }]}>{value}</Text>
    </View>
  )
}

// ── Animation helpers ───────────────────────────────────────────────

function RiseRow({ delay, children }: { delay: number; children: React.ReactNode }) {
  const reduced = useReducedMotion()
  const y = useSharedValue(reduced ? 0 : 10)
  const opacity = useSharedValue(reduced ? 1 : 0)
  useEffect(() => {
    if (reduced) return
    y.value = withDelay(delay, withTiming(0, { duration: 460, easing: ENTER }))
    opacity.value = withDelay(delay, withTiming(1, { duration: 460, easing: ENTER }))
    return () => {
      cancelAnimation(y)
      cancelAnimation(opacity)
    }
  }, [delay, reduced, y, opacity])
  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: y.value }],
  }))
  return <Animated.View style={style}>{children}</Animated.View>
}

function RuleScale({ color, delay }: { color: string; delay: number }) {
  const reduced = useReducedMotion()
  const scale = useSharedValue(reduced ? 1 : 0)
  const opacity = useSharedValue(reduced ? 1 : 0)
  useEffect(() => {
    if (reduced) return
    scale.value = withDelay(delay, withTiming(1, { duration: 540, easing: ENTER }))
    opacity.value = withDelay(delay, withTiming(1, { duration: 320, easing: ENTER }))
    return () => {
      cancelAnimation(scale)
      cancelAnimation(opacity)
    }
  }, [delay, reduced, scale, opacity])
  const animStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scaleX: scale.value }],
  }))
  return (
    <Animated.View
      style={[styles.rule, { backgroundColor: color, transformOrigin: 'left' }, animStyle]}
    />
  )
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 24,
    padding: 20,
    overflow: 'hidden',
    borderWidth: 1,
  },
  // Masthead · brand izquierda + score badge derecha
  masthead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
  },
  brand: {
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 2.4,
  },
  mastheadDate: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.6,
    flexShrink: 1,
  },
  scoreBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
  },
  scoreBadgeValue: {
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: -0.2,
    fontVariant: ['tabular-nums'],
  },
  scoreBadgeLabel: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  rule: {
    width: 28,
    height: 2,
    marginTop: 10,
    marginBottom: 12,
  },
  // Coach row · avatar + intro
  coachRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 6,
  },
  coachAvatar: {
    width: 34,
    height: 34,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
  },
  coachIntro: {
    fontSize: 12,
    fontWeight: '600',
    fontStyle: 'italic',
  },
  // Editorial body
  headline: {
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: -0.6,
    lineHeight: 28,
    marginTop: 8,
  },
  lead: {
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 18,
    marginTop: 6,
    fontStyle: 'italic',
    maxWidth: 320,
  },
  numberBlock: {
    marginTop: 14,
    marginBottom: 14,
  },
  numberLabel: {
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.4,
    marginBottom: 4,
  },
  numberValue: {
    fontSize: 32,
    fontWeight: '900',
    letterSpacing: -1.4,
    lineHeight: 36,
    fontVariant: ['tabular-nums'],
  },
  // Chips row
  chipsScroll: {
    marginBottom: 14,
    marginHorizontal: -20, // bleed para scrollable que se extienda al borde
  },
  chipsContent: {
    gap: 6,
    paddingHorizontal: 20,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
  },
  chipValue: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: -0.1,
    fontVariant: ['tabular-nums'],
  },
  chipLabel: {
    fontSize: 10,
    fontWeight: '600',
  },
  chipsEmpty: {
    fontSize: 11,
    fontStyle: 'italic',
    marginBottom: 12,
  },
  // Ticker footer
  tickerRow: {
    flexDirection: 'row',
    paddingTop: 12,
    borderTopWidth: 1,
  },
  tickerCol: {
    flex: 1,
  },
  tickerLabel: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1.2,
    marginBottom: 2,
  },
  tickerValue: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: -0.2,
    fontVariant: ['tabular-nums'],
  },
})
