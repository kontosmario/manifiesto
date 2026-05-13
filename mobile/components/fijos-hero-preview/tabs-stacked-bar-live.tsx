import { useCallback, useEffect, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated'
import { useReducedMotion } from '@/hooks/use-reduced-motion'
import { triggerHaptic } from '@/lib/haptics'
import { motionEasings } from '@/lib/motion/tokens'
import { useAppTheme } from '@/theme/theme-provider'
import { buildProximosPalette } from './proximos-colors'
import { RiseRow } from './smart-alerts-helpers'
import type { HeroState } from './hero-states'

const ENTER = motionEasings.enterSmooth

type Filter = 'todos' | 'pagados' | 'pendientes' | 'vencidos'

interface TabsStackedBarLiveProps {
  state: HeroState
}

/**
 * Variant B · Stacked composition bar. La barra ES el filtro. Muestra
 * la proporción visual de pagados / pendientes / vencidos como
 * stacked segments con anchos proporcionales al monto $. Tap en un
 * segmento → filtra ese bucket. Tap en "Todos" → muestra la barra
 * completa.
 *
 * Highlighting: el segmento activo mantiene saturación, los inactivos
 * bajan a 40% opacity. Captions inferiores muestran el count y monto
 * del bucket activo.
 *
 * Animation: cada segmento crece de width 0 a su ratio en mount
 * (stagger 80ms). Tap → opacity de inactivos transitions 220ms.
 */
export function TabsStackedBarLive({ state }: TabsStackedBarLiveProps) {
  const { theme } = useAppTheme()
  const palette = buildProximosPalette(theme)
  const reduced = useReducedMotion()
  const [active, setActive] = useState<Filter>('todos')

  const total = state.totalFijos
  const paidPct = total > 0 ? state.montoPagado / total : 0
  const overduePct = total > 0 ? state.montoVencido / total : 0
  const pendingPct = total > 0 ? state.montoPendiente / total : 0

  const handlePress = useCallback((f: Filter) => {
    void triggerHaptic('selection')
    setActive((prev) => (prev === f ? 'todos' : f))
  }, [])

  // Shared values per segment for entrance width animation
  const paidW = useSharedValue(reduced ? paidPct : 0)
  const pendingW = useSharedValue(reduced ? pendingPct : 0)
  const overdueW = useSharedValue(reduced ? overduePct : 0)

  useEffect(() => {
    if (reduced) {
      paidW.value = paidPct
      pendingW.value = pendingPct
      overdueW.value = overduePct
      return
    }
    paidW.value = withDelay(120, withTiming(paidPct, { duration: 720, easing: ENTER }))
    pendingW.value = withDelay(200, withTiming(pendingPct, { duration: 720, easing: ENTER }))
    overdueW.value = withDelay(280, withTiming(overduePct, { duration: 720, easing: ENTER }))
    return () => {
      cancelAnimation(paidW)
      cancelAnimation(pendingW)
      cancelAnimation(overdueW)
    }
  }, [reduced, paidPct, pendingPct, overduePct, paidW, pendingW, overdueW])

  const paidStyle = useAnimatedStyle(() => ({
    width: `${paidW.value * 100}%`,
    opacity: active === 'todos' || active === 'pagados' ? 1 : 0.35,
  }))
  const pendingStyle = useAnimatedStyle(() => ({
    width: `${pendingW.value * 100}%`,
    opacity: active === 'todos' || active === 'pendientes' ? 1 : 0.35,
  }))
  const overdueStyle = useAnimatedStyle(() => ({
    width: `${overdueW.value * 100}%`,
    opacity: active === 'todos' || active === 'vencidos' ? 1 : 0.35,
  }))

  const activeBucket = getActiveBucket(state, active)

  if (state.isEmpty) {
    return (
      <View
        style={[
          styles.card,
          {
            backgroundColor: theme.colors.creamCard,
            borderColor: theme.colors.line,
          },
        ]}
      >
        <RiseRow delay={0}>
          <Text style={[styles.emptyText, { color: theme.colors.textMuted }]}>
            Cargá tus fijos para ver la composición del ciclo.
          </Text>
        </RiseRow>
      </View>
    )
  }

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: theme.colors.creamCard,
          borderColor: theme.colors.line,
        },
      ]}
    >
      <RiseRow delay={0}>
        <View style={styles.headerRow}>
          <Pressable
            onPress={() => handlePress('todos')}
            style={styles.allBtn}
            accessibilityRole="button"
          >
            <Text
              style={[
                styles.allLabel,
                {
                  color: active === 'todos' ? theme.colors.text : theme.colors.textMuted,
                  fontWeight: active === 'todos' ? '800' : '600',
                },
              ]}
            >
              Todos
            </Text>
            <Text style={[styles.allCount, { color: theme.colors.textMuted }]}>
              {state.cantidadFijos}
            </Text>
          </Pressable>
        </View>
      </RiseRow>

      {/* Stacked bar */}
      <RiseRow delay={80}>
        <View
          style={[styles.barTrack, { backgroundColor: palette.trackBg }]}
        >
          <Pressable
            onPress={() => handlePress('pagados')}
            style={styles.barSegmentPress}
            accessibilityRole="button"
            accessibilityLabel={`Pagados, ${state.cantidadPagados} ítems`}
          >
            <Animated.View
              style={[styles.segment, { backgroundColor: palette.success }, paidStyle]}
            />
          </Pressable>
          <Pressable
            onPress={() => handlePress('pendientes')}
            style={styles.barSegmentPress}
          >
            <Animated.View
              style={[
                styles.segment,
                { backgroundColor: palette.barMid },
                pendingStyle,
              ]}
            />
          </Pressable>
          <Pressable
            onPress={() => handlePress('vencidos')}
            style={styles.barSegmentPress}
          >
            <Animated.View
              style={[
                styles.segment,
                { backgroundColor: palette.urgency },
                overdueStyle,
              ]}
            />
          </Pressable>
        </View>
      </RiseRow>

      {/* Legend rows */}
      <RiseRow delay={160}>
        <View style={styles.legend}>
          <LegendChip
            label="Pagados"
            count={state.cantidadPagados}
            color={palette.success}
            active={active === 'todos' || active === 'pagados'}
            onPress={() => handlePress('pagados')}
            textColor={theme.colors.text}
            textMuted={theme.colors.textMuted}
          />
          <LegendChip
            label="Pendientes"
            count={state.cantidadPendientes}
            color={palette.barMid}
            active={active === 'todos' || active === 'pendientes'}
            onPress={() => handlePress('pendientes')}
            textColor={theme.colors.text}
            textMuted={theme.colors.textMuted}
          />
          <LegendChip
            label="Vencidos"
            count={state.cantidadVencidos}
            color={palette.urgency}
            active={active === 'todos' || active === 'vencidos'}
            onPress={() => handlePress('vencidos')}
            textColor={theme.colors.text}
            textMuted={theme.colors.textMuted}
          />
        </View>
      </RiseRow>

      {/* Active caption */}
      {active !== 'todos' ? (
        <RiseRow delay={220}>
          <Text style={[styles.caption, { color: theme.colors.textMuted }]}>
            Mostrando <Text style={{ color: theme.colors.text, fontWeight: '700' }}>{activeBucket.count} {activeBucket.count === 1 ? 'ítem' : 'ítems'}</Text> por <Text style={{ color: theme.colors.text, fontWeight: '700' }}>{activeBucket.amountStr}</Text>
          </Text>
        </RiseRow>
      ) : null}
    </View>
  )
}

function LegendChip({
  label,
  count,
  color,
  active,
  onPress,
  textColor,
  textMuted,
}: {
  label: string
  count: number
  color: string
  active: boolean
  onPress: () => void
  textColor: string
  textMuted: string
}) {
  return (
    <Pressable onPress={onPress} style={styles.legendChip}>
      <View
        style={[
          styles.legendDot,
          {
            backgroundColor: color,
            opacity: active ? 1 : 0.45,
          },
        ]}
      />
      <Text
        style={[
          styles.legendLabel,
          {
            color: active ? textColor : textMuted,
            fontWeight: active ? '700' : '600',
          },
        ]}
      >
        {label}
      </Text>
      <Text style={[styles.legendCount, { color: textMuted }]}>{count}</Text>
    </Pressable>
  )
}

function getActiveBucket(state: HeroState, active: Filter) {
  if (active === 'pagados') {
    return {
      count: state.cantidadPagados,
      amountStr: formatBucketAmount(state.montoPagado),
    }
  }
  if (active === 'pendientes') {
    return {
      count: state.cantidadPendientes,
      amountStr: formatBucketAmount(state.montoPendiente),
    }
  }
  if (active === 'vencidos') {
    return {
      count: state.cantidadVencidos,
      amountStr: formatBucketAmount(state.montoVencido),
    }
  }
  return {
    count: state.cantidadFijos,
    amountStr: formatBucketAmount(state.totalFijos),
  }
}

function formatBucketAmount(n: number): string {
  return `$ ${Math.round(n).toLocaleString('es-AR')}`
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 20,
    paddingHorizontal: 18,
    paddingVertical: 18,
    borderWidth: 1,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  allBtn: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
  },
  allLabel: {
    fontSize: 14,
    letterSpacing: -0.2,
  },
  allCount: {
    fontSize: 12,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  barTrack: {
    flexDirection: 'row',
    height: 12,
    borderRadius: 999,
    overflow: 'hidden',
    marginBottom: 14,
  },
  barSegmentPress: {
    height: '100%',
    justifyContent: 'center',
  },
  segment: {
    height: '100%',
  },
  legend: {
    flexDirection: 'row',
    gap: 14,
    flexWrap: 'wrap',
  },
  legendChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendLabel: {
    fontSize: 12,
    letterSpacing: -0.1,
  },
  legendCount: {
    fontSize: 11,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  caption: {
    fontSize: 11,
    marginTop: 12,
    lineHeight: 16,
  },
  emptyText: {
    fontSize: 13,
    lineHeight: 18,
    fontStyle: 'italic',
  },
})
