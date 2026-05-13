import { useEffect, useMemo } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import Animated, {
  cancelAnimation,
  useAnimatedProps,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated'
import Svg, {
  Circle,
  Defs,
  LinearGradient as SvgGradient,
  Path,
  Stop,
} from 'react-native-svg'
import { CountUpText } from '@/components/home/animated/count-up-text'
import { useReducedMotion } from '@/hooks/use-reduced-motion'
import { motionEasings } from '@/lib/motion/tokens'
import { formatMoney } from '@/utils/money'
import { moneyShort } from './home-hero-helpers'
import type { HomeHeroState } from './home-hero-states'

const ENTER = motionEasings.enterSmooth
const AnimatedPath = Animated.createAnimatedComponent(Path)
const AnimatedCircle = Animated.createAnimatedComponent(Circle)

const SvgGradientFC = SvgGradient as unknown as React.FC<
  React.ComponentProps<typeof SvgGradient> & { children?: React.ReactNode }
>
const StopFC = Stop as unknown as React.FC<React.ComponentProps<typeof Stop>>
const DefsFC = Defs as unknown as React.FC<{ children?: React.ReactNode }>

const CARD_W = 340
const CHART_H = 130
const CHART_PADDING = 16

/**
 * Variant E · El Pulso · waveform · live signal
 *
 * El balance del ciclo dibujado como pulso continuo: día 0 (saldo
 * inicial) → día N (hoy, pico con halo) → cierre proyectado. Pasado
 * sólido, futuro stroke-dasharray fadeando. El saldo se lee en el
 * Y donde está la línea HOY. CRT glow sutil + medical-chart grid.
 *
 * Aprovecha que la proyección ES el héroe — la sub-tile "vas a cerrar
 * con" se vuelve un eje X completo, no un número aislado.
 */
export function HomeHeroPulso({ state }: { state: HomeHeroState }) {
  const reduced = useReducedMotion()

  // Build the balance trajectory · linear interpolation past + linear
  // projection future. 30 points along the full cycle.
  const trajectory = useMemo(() => {
    const days = state.cycleTotalDays
    const arr: { day: number; balance: number; isPast: boolean }[] = []
    const startBalance = state.monthlyIncome
    const todayBalance = state.availableToday
    const closeBalance = state.incomeConfigured ? state.projectedClose : 0

    for (let d = 0; d <= days; d++) {
      if (d <= state.cycleDay) {
        // Past · linear interp from start to today
        const t = state.cycleDay === 0 ? 0 : d / state.cycleDay
        arr.push({ day: d, balance: startBalance + (todayBalance - startBalance) * t, isPast: true })
      } else {
        // Future · linear projection from today to close
        const t = (d - state.cycleDay) / Math.max(1, days - state.cycleDay)
        arr.push({ day: d, balance: todayBalance + (closeBalance - todayBalance) * t, isPast: false })
      }
    }
    return arr
  }, [state])

  // Compute scaled coords
  const { pastPath, futurePath, hoyX, hoyY, closeY, minB, maxB } = useMemo(() => {
    const minB = Math.min(...trajectory.map((p) => p.balance), 0)
    const maxB = Math.max(...trajectory.map((p) => p.balance), state.monthlyIncome)
    const span = Math.max(1, maxB - minB)
    const w = CARD_W - CHART_PADDING * 2
    const xFor = (d: number) => CHART_PADDING + (d / state.cycleTotalDays) * w
    const yFor = (b: number) =>
      CHART_PADDING + (1 - (b - minB) / span) * (CHART_H - CHART_PADDING * 2)

    let pastPath = ''
    let futurePath = ''
    trajectory.forEach((p, i) => {
      const x = xFor(p.day)
      const y = yFor(p.balance)
      if (p.isPast) {
        pastPath += `${i === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)} `
      } else {
        if (futurePath === '') {
          // Start future at the last past point for continuity
          const prev = trajectory[i - 1]
          if (prev) futurePath += `M ${xFor(prev.day).toFixed(2)} ${yFor(prev.balance).toFixed(2)} `
        }
        futurePath += `L ${x.toFixed(2)} ${y.toFixed(2)} `
      }
    })

    return {
      pastPath: pastPath.trim(),
      futurePath: futurePath.trim(),
      hoyX: xFor(state.cycleDay),
      hoyY: yFor(state.availableToday),
      closeY: yFor(state.incomeConfigured ? state.projectedClose : 0),
      minB,
      maxB,
    }
  }, [trajectory, state])

  // Path draw animation · stroke-dashoffset from full to 0
  const dashProgress = useSharedValue(reduced ? 1 : 0)
  useEffect(() => {
    if (reduced) {
      dashProgress.value = 1
      return
    }
    dashProgress.value = withDelay(180, withTiming(1, { duration: 1200, easing: ENTER }))
    return () => cancelAnimation(dashProgress)
  }, [reduced, dashProgress])

  const pastAnimProps = useAnimatedProps(() => ({
    strokeDashoffset: (1 - Math.min(1, dashProgress.value * 2)) * 800,
  }))
  const futureAnimProps = useAnimatedProps(() => ({
    strokeDashoffset: (1 - Math.max(0, dashProgress.value * 2 - 1)) * 800,
  }))

  // HOY dot pulse · breathe halo radius
  const haloR = useSharedValue(8)
  useEffect(() => {
    if (reduced) return
    const pulse = () => {
      haloR.value = withTiming(14, { duration: 1100, easing: ENTER })
      setTimeout(() => {
        haloR.value = withTiming(8, { duration: 1100, easing: ENTER })
      }, 1100)
    }
    pulse()
    const interval = setInterval(pulse, 2200)
    return () => {
      clearInterval(interval)
      cancelAnimation(haloR)
    }
  }, [reduced, haloR])

  const haloProps = useAnimatedProps(() => ({ r: haloR.value }))

  const projColor = state.projectedClose < 0 ? '#F2A78C' : '#A6EF8F'
  const pastColor = '#A6EF8F'

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: '#0A1115',
          borderColor: 'rgba(166,239,143,0.18)',
        },
      ]}
    >
      <View style={styles.headerRow}>
        <Text style={styles.label}>BALANCE · CICLO</Text>
        <Text style={styles.dayLabel}>día {state.cycleDay}/{state.cycleTotalDays}</Text>
      </View>

      <View style={styles.amountRow}>
        <CountUpText
          value={state.availableToday}
          format={(n) => formatMoney(n)}
          style={styles.amount}
        />
        <View style={[styles.closePill, { borderColor: projColor }]}>
          <Text style={[styles.closeLabel, { color: projColor }]}>
            cierra {state.projectionReliable
              ? `${state.projectedClose >= 0 ? '+' : '−'}$${moneyShort(state.projectedClose)}`
              : '—'}
          </Text>
        </View>
      </View>

      {/* The waveform */}
      <View style={styles.chart} pointerEvents="none">
        <Svg width={CARD_W - 32} height={CHART_H}>
          <DefsFC>
          <SvgGradientFC id="pastFill" x1="0" y1="0" x2="0" y2="1">
            <StopFC offset="0" stopColor={pastColor} stopOpacity="0.18" />
            <StopFC offset="1" stopColor={pastColor} stopOpacity="0" />
          </SvgGradientFC>
        </DefsFC>

        {/* Grid lines · 4 horizontal */}
        {[0, 0.25, 0.5, 0.75, 1].map((t) => {
          const y = CHART_PADDING + t * (CHART_H - CHART_PADDING * 2)
          return (
            <Path
              key={t}
              d={`M ${CHART_PADDING} ${y} L ${CARD_W - 64 - CHART_PADDING} ${y}`}
              stroke="rgba(166,239,143,0.06)"
              strokeWidth={0.5}
              strokeDasharray="2 4"
            />
          )
        })}

        {/* Zero line if relevant */}
        {minB < 0 && maxB > 0 ? (
          <Path
            d={`M ${CHART_PADDING} ${CHART_PADDING + ((maxB) / (maxB - minB)) * (CHART_H - CHART_PADDING * 2)} L ${CARD_W - 64 - CHART_PADDING} ${CHART_PADDING + ((maxB) / (maxB - minB)) * (CHART_H - CHART_PADDING * 2)}`}
            stroke="rgba(242,167,140,0.35)"
            strokeWidth={1}
          />
        ) : null}

        {/* Past · solid */}
        <AnimatedPath
          d={pastPath}
          stroke={pastColor}
          strokeWidth={2.2}
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray="800 800"
          animatedProps={pastAnimProps}
        />

        {/* Future · dashed */}
        <AnimatedPath
          d={futurePath}
          stroke={projColor}
          strokeWidth={1.8}
          fill="none"
          strokeDasharray="3 4"
          opacity={0.7}
          animatedProps={futureAnimProps}
        />

        {/* HOY halo */}
        <AnimatedCircle
          cx={hoyX}
          cy={hoyY}
          fill={pastColor}
          opacity={0.18}
          animatedProps={haloProps}
        />
        <Circle cx={hoyX} cy={hoyY} r={4} fill="#F2EAD3" />

        {/* Close marker */}
          <Circle
            cx={CARD_W - 32 - CHART_PADDING}
            cy={closeY}
            r={3}
            fill={projColor}
            opacity={0.9}
          />
        </Svg>
      </View>

      <View style={styles.axis}>
        <Text style={styles.axisLabel}>{state.cycleStartLabel}</Text>
        <Text style={[styles.axisLabel, styles.axisLabelMid]}>HOY</Text>
        <Text style={styles.axisLabel}>{state.cycleEndLabel}</Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    overflow: 'hidden',
    width: CARD_W,
    alignSelf: 'center',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  label: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.8,
    color: '#A6EF8F',
    textTransform: 'uppercase',
  },
  dayLabel: {
    fontSize: 10,
    color: 'rgba(242,234,211,0.45)',
    letterSpacing: 0.4,
    fontVariant: ['tabular-nums'],
    fontFamily: 'Menlo',
  },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  amount: {
    fontSize: 34,
    fontWeight: '900',
    letterSpacing: -1.4,
    color: '#F2EAD3',
    fontVariant: ['tabular-nums'],
  },
  closePill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
  },
  closeLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.4,
    fontVariant: ['tabular-nums'],
  },
  chart: { marginTop: 4, marginLeft: -16 },
  axis: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
    marginTop: 4,
  },
  axisLabel: {
    fontSize: 9,
    color: 'rgba(242,234,211,0.4)',
    letterSpacing: 0.6,
    fontFamily: 'Menlo',
  },
  axisLabelMid: {
    color: 'rgba(242,234,211,0.75)',
    fontWeight: '800',
  },
})
