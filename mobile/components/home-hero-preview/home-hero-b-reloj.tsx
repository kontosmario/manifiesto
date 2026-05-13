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
import Svg, { Defs, LinearGradient as SvgGradient, Path, Stop } from 'react-native-svg'
import { CountUpText } from '@/components/home/animated/count-up-text'
import { useReducedMotion } from '@/hooks/use-reduced-motion'
import { motionEasings } from '@/lib/motion/tokens'
import { formatMoney } from '@/utils/money'
import { useAppTheme } from '@/theme/theme-provider'
import { cycleProgress, daypartTint, moneyShort } from './home-hero-helpers'
import type { HomeHeroState } from './home-hero-states'

const ENTER = motionEasings.enterSmooth

const CARD_W = 340
const ARC_H = 110
const ARC_PADDING_X = 20
const ARC_R = (CARD_W - ARC_PADDING_X * 2) / 2

const SvgGradientFC = SvgGradient as unknown as React.FC<
  React.ComponentProps<typeof SvgGradient> & { children?: React.ReactNode }
>
const StopFC = Stop as unknown as React.FC<React.ComponentProps<typeof Stop>>
const DefsFC = Defs as unknown as React.FC<{ children?: React.ReactNode }>

/**
 * Variant B · El Reloj de Sol · daypart-aware luxury
 *
 * Arco semicircular ocupa el top — el sol del ciclo. La posición
 * del sol indica progress del ciclo (sunrise = día 1, sunset = cierre).
 * El cielo cambia con `daypart`: amber matinal, azul mediodía, peach
 * atardecer, índigo noche. Saldo grande flota encima. Tiles invisibles
 * por default · solo se asoman 3 stats sutiles al pie.
 */
export function HomeHeroReloj({ state }: { state: HomeHeroState }) {
  const { theme } = useAppTheme()
  const reduced = useReducedMotion()
  const tint = daypartTint(state.daypart)
  const progress = cycleProgress(state)

  // Sun position animation · 0 → progress along the arc
  const sun = useSharedValue(reduced ? progress : 0)
  useEffect(() => {
    if (reduced) {
      sun.value = progress
      return
    }
    sun.value = withDelay(220, withTiming(progress, { duration: 1100, easing: ENTER }))
    return () => cancelAnimation(sun)
  }, [progress, reduced, sun])

  const sunStyle = useAnimatedStyle(() => {
    // Map 0..1 to π..0 → sunrise (left) to sunset (right)
    const angle = (1 - sun.value) * Math.PI
    const cx = ARC_PADDING_X + ARC_R + Math.cos(angle) * ARC_R
    const cy = ARC_H - Math.sin(angle) * (ARC_R * 0.85)
    return {
      transform: [
        { translateX: cx - 14 }, // center the 28px sun
        { translateY: cy - 14 },
      ],
    }
  })

  // Arc path · semicircle
  const arcPath = `M ${ARC_PADDING_X},${ARC_H} A ${ARC_R},${ARC_R * 0.92} 0 0 1 ${ARC_PADDING_X + ARC_R * 2},${ARC_H}`

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: '#0E1B14', // forest deep
          borderColor: 'rgba(255,255,255,0.08)',
        },
      ]}
    >
      {/* Sky · daypart gradient */}
      <LinearGradient
        colors={[tint.skyTop, tint.skyMid, '#0E1B14'] as unknown as readonly [string, string, ...string[]]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={styles.sky}
      />

      {/* Arc track */}
      <View style={styles.arcSvg} pointerEvents="none">
        <Svg width={CARD_W} height={ARC_H + 30}>
          <DefsFC>
          <SvgGradientFC id="arc" x1="0" y1="0" x2="1" y2="0">
            <StopFC offset="0" stopColor={tint.orb} stopOpacity="0.15" />
            <StopFC offset="0.5" stopColor={tint.orb} stopOpacity="0.45" />
            <StopFC offset="1" stopColor={tint.orb} stopOpacity="0.15" />
          </SvgGradientFC>
        </DefsFC>
          <Path d={arcPath} stroke="url(#arc)" strokeWidth={1.2} fill="none" />
        </Svg>
      </View>

      {/* Sun · orb with halo */}
      <Animated.View style={[styles.sun, sunStyle]}>
        <View
          style={[styles.sunHalo, { backgroundColor: tint.halo }]}
          pointerEvents="none"
        />
        <View
          style={[
            styles.sunOrb,
            { backgroundColor: tint.orb, shadowColor: tint.orb },
          ]}
        />
      </Animated.View>

      {/* Content */}
      <View style={styles.content}>
        <Text style={[styles.greeting, { color: tint.orb }]}>{tint.greeting}</Text>
        <CountUpText
          value={state.availableToday}
          format={(n) => formatMoney(n)}
          style={[styles.amount, { color: theme.colors.heroText }]}
        />
        <Text style={[styles.subline, { color: theme.colors.heroMuted }]}>
          en tu ciclo · día {state.cycleDay} de {state.cycleTotalDays}
        </Text>

        <View style={[styles.footer, { borderTopColor: 'rgba(255,255,255,0.08)' }]}>
          <Stat
            label="por día"
            value={`$${moneyShort(state.dailyBudget)}`}
            color={theme.colors.heroAccent}
          />
          <DividerY />
          <Stat
            label="cierre"
            value={
              state.projectionReliable
                ? `${state.projectedClose >= 0 ? '+' : ''}$${moneyShort(state.projectedClose)}`
                : '—'
            }
            color={state.projectedClose < 0 ? '#F8D1C3' : theme.colors.heroText}
          />
          <DividerY />
          <Stat
            label="cobro"
            value={`${Math.max(0, state.cycleTotalDays - state.cycleDay)}d`}
            color={theme.colors.heroMuted2}
          />
        </View>
      </View>
    </View>
  )
}

function Stat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View style={styles.stat}>
      <Text style={[styles.statLabel, { color: 'rgba(242,234,211,0.5)' }]}>{label}</Text>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
    </View>
  )
}

function DividerY() {
  return <View style={styles.divY} />
}

const styles = StyleSheet.create({
  card: {
    width: CARD_W,
    borderRadius: 22,
    borderWidth: 1,
    overflow: 'hidden',
    paddingTop: ARC_H + 18,
    paddingBottom: 18,
    paddingHorizontal: 20,
    alignSelf: 'center',
  },
  sky: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: ARC_H + 60,
  },
  arcSvg: {
    position: 'absolute',
    top: 8,
    left: 0,
  },
  sun: {
    position: 'absolute',
    top: 8,
    left: 0,
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sunHalo: {
    position: 'absolute',
    width: 60,
    height: 60,
    borderRadius: 999,
    opacity: 0.7,
  },
  sunOrb: {
    width: 24,
    height: 24,
    borderRadius: 999,
    shadowOpacity: 0.6,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 0 },
  },
  content: { alignItems: 'flex-start' },
  greeting: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  amount: {
    fontSize: 38,
    fontWeight: '900',
    letterSpacing: -1.6,
    lineHeight: 42,
    fontVariant: ['tabular-nums'],
  },
  subline: {
    fontSize: 12,
    fontWeight: '500',
    letterSpacing: 0.2,
    marginTop: 6,
    fontStyle: 'italic',
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 12,
    marginTop: 14,
    borderTopWidth: 1,
    alignSelf: 'stretch',
  },
  stat: { flex: 1 },
  statLabel: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  statValue: {
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: -0.3,
    fontVariant: ['tabular-nums'],
  },
  divY: { width: 1, height: 28, backgroundColor: 'rgba(255,255,255,0.10)', marginHorizontal: 4 },
})
