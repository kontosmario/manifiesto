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
 * Variant E · El Periódico · newspaper front-page editorial. Estilo
 * NY Times A1. Masthead con fecha + brand · headline grande serif-y
 * (weight 900 tracking -2) · lead paragraph · stock-prices style
 * footer con stats. Editorial restraint puro.
 */
export function ControlHeroPeriodico({ state }: Props) {
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
      <ShineOverlay width={430} height={360} tint={theme.colors.shineOverlay} delayMs={1000} periodMs={4200} />
      <CardParticles count={12} accentColor={authTokens.peach} />

      {/* Masthead — brand mark + fecha en serif-like */}
      <RiseRow delay={0}>
        <View style={styles.masthead}>
          <Text style={[styles.brand, { color: theme.colors.heroAccent }]}>
            MANIFIESTO
          </Text>
          <View style={styles.mastheadRight}>
            <BreatheDot size={5} color={tone} glow={tone} />
            <Text style={[styles.mastheadDate, { color: theme.colors.heroMuted2 }]}>
              {state.diaLabel}
            </Text>
          </View>
        </View>
      </RiseRow>

      {/* Heavy rule */}
      <RuleScale color={theme.colors.heroAccent} delay={80} thickness={1} />

      {/* Editorial section · "EDICIÓN MAÑANA" eyebrow */}
      <RiseRow delay={140}>
        <Text style={[styles.section, { color: tone }]}>
          {sectionLabelFor(state)}
        </Text>
      </RiseRow>

      {/* Big headline */}
      <RiseRow delay={220}>
        <Text style={[styles.headline, { color: theme.colors.heroText }]}>
          {msg.primary}
        </Text>
      </RiseRow>

      {/* Lead paragraph */}
      <RiseRow delay={300}>
        <Text style={[styles.lead, { color: theme.colors.heroMuted }]}>
          {msg.secondary}
        </Text>
      </RiseRow>

      {/* Big number */}
      <RiseRow delay={380}>
        <View style={styles.numberBlock}>
          <Text style={[styles.numberLabel, { color: theme.colors.heroMuted2 }]}>
            {msg.primaryLabel}
          </Text>
          <CountUpText
            value={msg.primaryNumber}
            duration={1000}
            format={(n) => (msg.primaryLabel === 'DÍAS HASTA AGOTAR' ? `${Math.round(n)} días` : formatMoney(Math.round(n)))}
            style={[styles.numberValue, { color: tone }]}
          />
        </View>
      </RiseRow>

      {/* Stock-prices footer · 3 mini stats */}
      <RiseRow delay={460}>
        <View style={[styles.tickerRow, { borderTopColor: 'rgba(255,255,255,0.10)' }]}>
          <TickerItem
            label="RACHA"
            value={state.racha === 0 ? '—' : `${state.racha}d`}
            trend={state.racha >= 3 ? 'up' : state.racha === 0 ? 'flat' : 'flat'}
            tone={state.racha >= 3 ? palette.positive : theme.colors.heroMuted}
          />
          <TickerItem
            label="COBRO"
            value={`${state.proximoSueldoEnDias}d`}
            trend="flat"
            tone={theme.colors.heroText}
          />
          <TickerItem
            label="MOMENTUM"
            value={`${state.momentum > 0 ? '↑' : '↓'}${Math.round(Math.abs(state.momentum - 1) * 100)}%`}
            trend={state.momentum > 1 ? 'up' : 'down'}
            tone={state.momentum > 1.1 ? palette.urgent : state.momentum < 0.95 ? palette.positive : theme.colors.heroMuted}
          />
        </View>
      </RiseRow>
    </LinearGradient>
  )
}

function sectionLabelFor(state: ControlHeroState): string {
  if (state.horaActual < 12) return 'EDICIÓN MAÑANA'
  if (state.horaActual < 19) return 'EDICIÓN TARDE'
  return 'EDICIÓN NOCHE'
}

function TickerItem({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  trend: 'up' | 'down' | 'flat'
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

function RuleScale({
  color,
  delay,
  thickness = 2,
}: {
  color: string
  delay: number
  thickness?: number
}) {
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
        {
          height: thickness,
          backgroundColor: color,
          transformOrigin: 'left',
          opacity: 0.4,
          marginVertical: 10,
        },
        animStyle,
      ]}
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
  masthead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  brand: {
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 2.8,
  },
  mastheadRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  mastheadDate: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.6,
  },
  section: {
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 2,
    marginBottom: 6,
  },
  headline: {
    fontSize: 30,
    fontWeight: '900',
    letterSpacing: -1.2,
    lineHeight: 34,
    marginBottom: 8,
  },
  lead: {
    fontSize: 14,
    fontWeight: '500',
    lineHeight: 19,
    fontStyle: 'italic',
    marginBottom: 14,
    maxWidth: 320,
  },
  numberBlock: {
    marginBottom: 14,
  },
  numberLabel: {
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.4,
    marginBottom: 4,
  },
  numberValue: {
    fontSize: 34,
    fontWeight: '900',
    letterSpacing: -1.4,
    lineHeight: 38,
    fontVariant: ['tabular-nums'],
  },
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
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: -0.2,
    fontVariant: ['tabular-nums'],
  },
})
