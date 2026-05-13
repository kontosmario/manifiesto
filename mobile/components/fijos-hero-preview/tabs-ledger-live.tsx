import { useCallback, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import Animated, {
  useAnimatedStyle,
  useSharedValue,
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

type LedgerFilter = 'todos' | 'pendientes' | 'pagados' | 'vencidos'

interface TabsLedgerLiveProps {
  state: HeroState
}

/**
 * Variant E · Numeric ledger. 4 columnas (Todos / Pendientes /
 * Pagados / Vencidos) cada una con: label small + count big + monto
 * pequeño. Estilo "extracto contable / dashboard editorial". Tap en
 * columna → filtro activo, top-border lime aparece en la columna
 * seleccionada como "subrayado de lápiz".
 *
 * Adapta el bucket Zombi → Vencidos (más útil hoy que el legacy
 * zombi). Muestra count + monto simultáneamente sin chip-soup.
 */
export function TabsLedgerLive({ state }: TabsLedgerLiveProps) {
  const { theme } = useAppTheme()
  const palette = buildProximosPalette(theme)
  const reduced = useReducedMotion()
  const [active, setActive] = useState<LedgerFilter>('todos')

  const handlePress = useCallback((f: LedgerFilter) => {
    void triggerHaptic('selection')
    setActive(f)
  }, [])

  const columns: Array<{
    id: LedgerFilter
    label: string
    count: number
    amount: number
    accent: string
  }> = [
    {
      id: 'todos',
      label: 'Todos',
      count: state.cantidadFijos,
      amount: state.totalFijos,
      accent: theme.colors.text,
    },
    {
      id: 'pendientes',
      label: 'Pendientes',
      count: state.cantidadPendientes,
      amount: state.montoPendiente,
      accent: palette.barMid,
    },
    {
      id: 'pagados',
      label: 'Pagados',
      count: state.cantidadPagados,
      amount: state.montoPagado,
      accent: palette.success,
    },
    {
      id: 'vencidos',
      label: 'Vencidos',
      count: state.cantidadVencidos,
      amount: state.montoVencido,
      accent: palette.urgency,
    },
  ]

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
        <Text style={[styles.eyebrow, { color: theme.colors.textMuted }]}>
          BUCKETS DEL CICLO
        </Text>
      </RiseRow>
      <View style={[styles.rule, { backgroundColor: theme.colors.text }]} />

      <View style={styles.row}>
        {columns.map((col, idx) => (
          <Column
            key={col.id}
            column={col}
            active={active === col.id}
            onPress={() => handlePress(col.id)}
            reduced={reduced}
            textColor={theme.colors.text}
            textMuted={theme.colors.textMuted}
            divider={theme.colors.line}
            isFirst={idx === 0}
          />
        ))}
      </View>
    </View>
  )
}

function Column({
  column,
  active,
  onPress,
  reduced,
  textColor,
  textMuted,
  divider,
  isFirst,
}: {
  column: { id: LedgerFilter; label: string; count: number; amount: number; accent: string }
  active: boolean
  onPress: () => void
  reduced: boolean
  textColor: string
  textMuted: string
  divider: string
  isFirst: boolean
}) {
  const indicatorWidth = useSharedValue(active ? 1 : 0)
  if (!reduced) {
    indicatorWidth.value = withTiming(active ? 1 : 0, { duration: 240, easing: ENTER })
  } else {
    indicatorWidth.value = active ? 1 : 0
  }
  const indicatorStyle = useAnimatedStyle(() => ({
    transform: [{ scaleX: indicatorWidth.value }],
  }))

  return (
    <Pressable
      onPress={onPress}
      style={styles.colPress}
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      accessibilityLabel={`${column.label}, ${column.count} ítems, ${formatLedgerAmount(column.amount)}`}
    >
      {!isFirst ? <View style={[styles.colDivider, { backgroundColor: divider }]} /> : null}
      <View style={styles.col}>
        {/* Top indicator (pencil-underline aesthetic) */}
        <Animated.View
          style={[
            styles.colIndicator,
            { backgroundColor: column.accent, transformOrigin: 'center' },
            indicatorStyle,
          ]}
        />
        <Text
          style={[
            styles.colCount,
            {
              color: active ? column.accent : textColor,
              opacity: active ? 1 : 0.68,
            },
          ]}
        >
          {column.count}
        </Text>
        <Text
          style={[
            styles.colLabel,
            {
              color: active ? column.accent : textMuted,
              fontWeight: active ? '800' : '600',
            },
          ]}
        >
          {column.label.toUpperCase()}
        </Text>
        <Text style={[styles.colAmount, { color: textMuted }]} numberOfLines={1}>
          {column.amount > 0 ? formatLedgerAmount(column.amount) : '—'}
        </Text>
      </View>
    </Pressable>
  )
}

function formatLedgerAmount(n: number): string {
  // Compact short form for ledger columns: $145k, $1.2M, etc
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `$${Math.round(n / 1_000)}k`
  return `$${n}`
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 20,
    paddingHorizontal: 18,
    paddingVertical: 18,
    borderWidth: 1,
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
    marginBottom: 18,
    opacity: 0.55,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  colPress: {
    flex: 1,
    flexDirection: 'row',
  },
  col: {
    flex: 1,
    alignItems: 'center',
    paddingTop: 6,
    gap: 3,
  },
  colDivider: {
    width: 1,
    alignSelf: 'stretch',
    opacity: 0.45,
  },
  colIndicator: {
    position: 'absolute',
    top: -6,
    left: 12,
    right: 12,
    height: 2,
    borderRadius: 1,
  },
  colCount: {
    fontSize: 26,
    fontWeight: '900',
    letterSpacing: -1,
    fontVariant: ['tabular-nums'],
    lineHeight: 30,
  },
  colLabel: {
    fontSize: 9,
    letterSpacing: 1.2,
    marginTop: 2,
  },
  colAmount: {
    fontSize: 11,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
    marginTop: 4,
  },
})
