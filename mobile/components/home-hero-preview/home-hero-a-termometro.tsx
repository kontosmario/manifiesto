import { useEffect } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated'
import { CountUpText } from '@/components/home/animated/count-up-text'
import { useReducedMotion } from '@/hooks/use-reduced-motion'
import { motionEasings } from '@/lib/motion/tokens'
import { formatMoney } from '@/utils/money'
import { useAppTheme } from '@/theme/theme-provider'
import { cycleProgress, deltaPctLabel, moneyShort } from './home-hero-helpers'
import type { HomeHeroState } from './home-hero-states'

const ENTER = motionEasings.enterSmooth

/**
 * Variant A · El Termómetro del Ciclo · spatial-temporal
 *
 * Hero como barra vertical = todo el ciclo (día 0 → cierre). Un
 * marcador "HOY" se desliza por la barra como mercurio en termómetro.
 * El fill marca el progreso del tiempo, las ticks marcan días pasados
 * (verde = bajo cupo · peach = excedido). Todo en monospace dark.
 */
export function HomeHeroTermometro({ state }: { state: HomeHeroState }) {
  const { theme } = useAppTheme()
  const reduced = useReducedMotion()
  const progress = cycleProgress(state)

  // Bar height animation · 0→progress · ease-out
  const fillH = useSharedValue(reduced ? progress : 0)
  useEffect(() => {
    if (reduced) {
      fillH.value = progress
      return
    }
    fillH.value = withDelay(160, withTiming(progress, { duration: 720, easing: ENTER }))
    return () => cancelAnimation(fillH)
  }, [progress, reduced, fillH])

  const fillStyle = useAnimatedStyle(() => ({
    height: `${fillH.value * 100}%`,
  }))

  const markerStyle = useAnimatedStyle(() => ({
    bottom: `${fillH.value * 100}%`,
  }))

  const totalDays = state.cycleTotalDays
  const ticks = Array.from({ length: totalDays }, (_, i) => i + 1)
  const isOverProjected = state.projectedClose < 0

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: theme.isDark ? '#0B0F1A' : '#101626',
          borderColor: 'rgba(166,239,143,0.18)',
        },
      ]}
    >
      <View style={styles.body}>
        {/* Left · the bar */}
        <View style={styles.barCol}>
          <View style={styles.barTopLabels}>
            <Text style={[styles.barEdgeLabel, { color: '#5D6A82' }]}>
              {state.cycleEndLabel}
            </Text>
          </View>
          <View
            style={[
              styles.barTrack,
              {
                borderColor: 'rgba(166,239,143,0.25)',
                backgroundColor: 'rgba(166,239,143,0.04)',
              },
            ]}
          >
            <Animated.View
              style={[
                styles.barFill,
                {
                  backgroundColor: isOverProjected
                    ? 'rgba(242,167,140,0.55)'
                    : 'rgba(166,239,143,0.42)',
                },
                fillStyle,
              ]}
            />
            <Animated.View
              style={[styles.barMarker, markerStyle]}
              accessibilityLabel="HOY"
            >
              <View style={styles.markerDot} />
              <View style={styles.markerArm} />
              <Text style={styles.markerText}>HOY</Text>
            </Animated.View>
          </View>
          <View style={styles.barTopLabels}>
            <Text style={[styles.barEdgeLabel, { color: '#5D6A82' }]}>
              {state.cycleStartLabel}
            </Text>
          </View>
        </View>

        {/* Right · stats column */}
        <View style={styles.statCol}>
          <Text style={[styles.label, { color: '#8B97AE' }]}>
            SALDO_DEL_MES
          </Text>
          <CountUpText
            value={state.availableToday}
            format={(n) => formatMoney(n)}
            style={[styles.amount, { color: '#E6EAF4' }]}
          />

          <View style={styles.statBlock}>
            <Row label="día__" value={`${state.cycleDay}/${totalDays}`} accent="#A6EF8F" />
            <Row label="cupo_" value={`$${moneyShort(state.dailyBudget)}/d`} accent="#A6EF8F" />
            <Row
              label="cierre"
              value={
                state.projectionReliable
                  ? `${state.projectedClose >= 0 ? '+' : ''}$${moneyShort(state.projectedClose)}`
                  : '—'
              }
              accent={state.projectedClose < 0 ? '#F2A78C' : '#A6EF8F'}
            />
            <Row
              label="vs__"
              value={deltaPctLabel(state.projectedCloseTrend)}
              accent={
                state.projectedCloseTrend == null
                  ? '#5D6A82'
                  : state.projectedCloseTrend < 0
                    ? '#A6EF8F'
                    : '#F2A78C'
              }
            />
          </View>

          {/* Day tick row · dots per closed day */}
          <View style={styles.ticksRow}>
            {ticks.map((d) => {
              const past = d <= state.cycleDay
              const winning = past && d <= state.closedWinningDays + 1
              return (
                <View
                  key={d}
                  style={[
                    styles.tick,
                    {
                      backgroundColor: !past
                        ? 'rgba(166,239,143,0.10)'
                        : winning
                          ? '#A6EF8F'
                          : '#F2A78C',
                      opacity: !past ? 0.35 : 1,
                    },
                  ]}
                />
              )
            })}
          </View>
        </View>
      </View>
    </View>
  )
}

function Row({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <View style={styles.row}>
      <Text style={[styles.rowLabel, { color: '#5D6A82' }]}>{label}</Text>
      <Text style={[styles.rowDots, { color: '#2E3548' }]}>.................</Text>
      <Text style={[styles.rowValue, { color: accent }]}>{value}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    overflow: 'hidden',
  },
  body: {
    flexDirection: 'row',
    gap: 18,
    minHeight: 280,
  },
  barCol: {
    width: 56,
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  barTopLabels: {
    height: 14,
    justifyContent: 'center',
  },
  barEdgeLabel: {
    fontSize: 9,
    fontFamily: 'Menlo',
    letterSpacing: 0.4,
  },
  barTrack: {
    width: 22,
    flex: 1,
    borderRadius: 4,
    borderWidth: 1,
    overflow: 'visible',
    position: 'relative',
  },
  barFill: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    borderBottomLeftRadius: 3,
    borderBottomRightRadius: 3,
  },
  barMarker: {
    position: 'absolute',
    left: -4,
    right: -32,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: -6,
  },
  markerDot: {
    width: 12,
    height: 12,
    borderRadius: 999,
    backgroundColor: '#F2EAD3',
    borderWidth: 2,
    borderColor: '#0B0F1A',
  },
  markerArm: {
    width: 10,
    height: 1.5,
    backgroundColor: '#F2EAD3',
  },
  markerText: {
    fontSize: 9,
    fontFamily: 'Menlo',
    fontWeight: '900',
    letterSpacing: 1.2,
    color: '#F2EAD3',
    marginLeft: 4,
  },
  statCol: { flex: 1, justifyContent: 'space-between' },
  label: {
    fontSize: 10,
    fontFamily: 'Menlo',
    letterSpacing: 1.4,
    marginBottom: 6,
  },
  amount: {
    fontSize: 32,
    fontWeight: '800',
    letterSpacing: -1.2,
    lineHeight: 36,
    fontVariant: ['tabular-nums'],
    marginBottom: 12,
  },
  statBlock: { gap: 4, marginBottom: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  rowLabel: {
    fontSize: 10,
    fontFamily: 'Menlo',
    letterSpacing: 0.4,
    minWidth: 38,
  },
  rowDots: {
    flex: 1,
    fontSize: 10,
    fontFamily: 'Menlo',
    letterSpacing: 0.4,
    overflow: 'hidden',
  },
  rowValue: {
    fontSize: 11,
    fontFamily: 'Menlo',
    fontWeight: '800',
    letterSpacing: 0.4,
    fontVariant: ['tabular-nums'],
  },
  ticksRow: {
    flexDirection: 'row',
    gap: 2,
    flexWrap: 'wrap',
  },
  tick: {
    width: 6,
    height: 6,
    borderRadius: 1,
  },
})
