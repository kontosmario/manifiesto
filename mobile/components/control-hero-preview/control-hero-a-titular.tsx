import { useEffect } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated'
import { LinearGradient } from 'expo-linear-gradient'
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
 * Variant A · El Titular — magazine cover. Sub-line + headline +
 * primary number + footer stats. Mismo DNA editorial que el hero
 * de Fijos winner. La opción "safe" — máxima legibilidad, cero
 * abstracción visual exótica.
 */
export function ControlHeroTitular({ state }: Props) {
  const { theme } = useAppTheme()
  const palette = buildControlHeroPalette()
  const msg = resolveControlMessage(state)
  const tone = statusColor(msg.status, palette)

  return (
    <LinearGradient
      colors={[...theme.colors.heroGradient] as unknown as readonly [string, string, ...string[]]}
      start={{ x: 0.1, y: 0 }}
      end={{ x: 0.9, y: 1 }}
      style={[styles.card, { borderColor: 'rgba(166,239,143,0.12)' }]}
    >
      <ShineOverlay
        width={430}
        height={360}
        tint={theme.colors.shineOverlay}
        delayMs={1000}
        periodMs={4200}
      />
      <CardParticles count={14} accentColor={authTokens.peach} />

      <RiseRow delay={0}>
        <View style={styles.headerRow}>
          <BreatheDot size={7} color={tone} glow={tone} />
          <Text style={[styles.eyebrow, { color: tone }]} numberOfLines={1}>
            {state.diaLabel}
          </Text>
          <View style={styles.headerSpacer} />
          {state.dailyGoalAmount != null ? (
            <MetaChip
              goal={state.dailyGoalAmount}
              gastoHoy={state.gastoHoy}
              palette={palette}
            />
          ) : null}
        </View>
      </RiseRow>

      <RuleScale color={tone} delay={80} />

      <RiseRow delay={160}>
        <Text style={[styles.headline, { color: theme.colors.heroText }]}>
          {msg.primary}
        </Text>
      </RiseRow>

      <RiseRow delay={240}>
        <Text style={[styles.secondary, { color: theme.colors.heroMuted }]}>
          {msg.secondary}
        </Text>
      </RiseRow>

      <RiseRow delay={320}>
        <View style={styles.numberBlock}>
          <Text style={[styles.numberLabel, { color: theme.colors.heroMuted2 }]}>
            {msg.primaryLabel}
          </Text>
          <CountUpText
            value={msg.primaryNumber}
            duration={900}
            format={(n) => (msg.primaryLabel === 'DÍAS HASTA AGOTAR' ? String(Math.round(n)) : formatMoney(Math.round(n)))}
            style={[styles.numberValue, { color: tone }]}
          />
        </View>
      </RiseRow>

      <RiseRow delay={400}>
        <View style={[styles.footerRow, { borderTopColor: 'rgba(255,255,255,0.10)' }]}>
          <FooterStat
            label="racha"
            value={state.racha === 0 ? '—' : `${state.racha}d`}
            color={state.racha > 0 ? palette.positive : theme.colors.heroMuted2}
          />
          <Divider />
          {state.vsMesDeltaPct != null ? (
            <FooterStat
              label="vs mes"
              value={formatDeltaPct(state.vsMesDeltaPct)}
              color={
                state.vsMesMejor === true
                  ? palette.positive
                  : state.vsMesMejor === false
                    ? palette.urgent
                    : theme.colors.heroAccent
              }
            />
          ) : (
            <FooterStat
              label="del cupo"
              value={`${Math.round((state.gastoHoy / state.cupoDiario) * 100)}%`}
              color={
                state.gastoHoy > state.cupoDiario ? palette.urgent : theme.colors.heroAccent
              }
            />
          )}
          {state.noSpendDaysCount != null && state.noSpendDaysCount > 0 ? (
            <>
              <Divider />
              <FooterStat
                label="sin gastos"
                value={`🌱 ${state.noSpendDaysCount}`}
                color={palette.positive}
              />
            </>
          ) : null}
          <Divider />
          <FooterStat
            label="al cobro"
            value={`${state.proximoSueldoEnDias}d`}
            color={theme.colors.heroText}
          />
        </View>
      </RiseRow>

    </LinearGradient>
  )
}

function formatDeltaPct(pct: number): string {
  const rounded = Math.round(pct)
  if (rounded === 0) return '='
  return rounded > 0 ? `+${rounded}%` : `${rounded}%`
}

function formatMoneyShort(n: number): string {
  const abs = Math.abs(n)
  if (abs >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (abs >= 10_000) return `$${Math.round(n / 1_000)}k`
  return `$${Math.round(n).toLocaleString('es-AR')}`
}

/**
 * META chip · pill discreta que muestra la meta diaria auto-impuesta
 * cuando el user opted into el goal. Color encoded: lime mientras
 * estás bajo la meta, peach cuando la pasaste.
 */
function MetaChip({
  goal,
  gastoHoy,
  palette,
}: {
  goal: number
  gastoHoy: number
  palette: ReturnType<typeof buildControlHeroPalette>
}) {
  const over = gastoHoy > goal
  const tint = over ? palette.urgent : palette.positive
  return (
    <View
      style={[
        styles.metaChip,
        {
          borderColor: `${tint}55`,
          backgroundColor: `${tint}14`,
        },
      ]}
    >
      <Text style={[styles.metaChipLabel, { color: tint }]}>META</Text>
      <Text style={[styles.metaChipValue, { color: tint }]}>{formatMoneyShort(goal)}</Text>
    </View>
  )
}

function FooterStat({
  label,
  value,
  color,
}: {
  label: string
  value: string
  color: string
}) {
  const { theme } = useAppTheme()
  return (
    <View style={styles.footerCol}>
      <Text style={[styles.footerLabel, { color: theme.colors.heroMuted2 }]}>
        {label}
      </Text>
      <Text style={[styles.footerValue, { color }]}>{value}</Text>
    </View>
  )
}

function Divider() {
  return <View style={styles.footerDivider} />
}

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
      style={[
        styles.rule,
        { backgroundColor: color, transformOrigin: 'left' },
        animStyle,
      ]}
    />
  )
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 24,
    padding: 22,
    overflow: 'hidden',
    borderWidth: 1,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerSpacer: { flex: 1 },
  metaChip: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
  },
  metaChipLabel: {
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 1.2,
  },
  metaChipValue: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: -0.1,
    fontVariant: ['tabular-nums'],
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.8,
  },
  rule: {
    width: 28,
    height: 2,
    marginTop: 10,
    marginBottom: 14,
  },
  headline: {
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: -0.6,
    lineHeight: 30,
  },
  secondary: {
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 18,
    marginTop: 8,
    maxWidth: 300,
  },
  numberBlock: {
    marginTop: 18,
  },
  numberLabel: {
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  numberValue: {
    fontSize: 40,
    fontWeight: '900',
    letterSpacing: -1.6,
    lineHeight: 44,
    fontVariant: ['tabular-nums'],
  },
  footerRow: {
    flexDirection: 'row',
    paddingTop: 14,
    marginTop: 18,
    borderTopWidth: 1,
  },
  footerCol: {
    flex: 1,
    alignItems: 'flex-start',
  },
  footerDivider: {
    width: 1,
    backgroundColor: 'rgba(255,255,255,0.10)',
    marginHorizontal: 4,
  },
  footerLabel: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 3,
  },
  footerValue: {
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: -0.2,
    fontVariant: ['tabular-nums'],
  },
})
