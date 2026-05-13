import { Pressable, StyleSheet, Text, View } from 'react-native'
import Animated from 'react-native-reanimated'
import Svg, { Path, Polyline } from 'react-native-svg'
import { formatMoney } from '@/utils/money'
import { usePressScale } from '@/hooks/use-press-scale'
import { useAppTheme } from '@/theme/theme-provider'
import { buildProximosPalette } from './proximos-colors'
import type { FijoItem } from './fijo-list-sample'

interface RowSparklineProps {
  item: FijoItem
}

/**
 * Variant B · Sparkline-hero. La tendencia de precio del fijo pasa
 * a ser visual primario — una mini-curva SVG (~6 puntos) entre el
 * name y el monto. Si está pagado, la curva se tinta success/lime;
 * si tiene hike reciente, se tinta peach urgent. La forma habla.
 *
 * Util cuando el usuario quiere ver "vino subiendo o no?" sin
 * tappear nada.
 */
export function RowSparkline({ item }: RowSparklineProps) {
  const { theme } = useAppTheme()
  const palette = buildProximosPalette(theme)
  const press = usePressScale({ pressedScale: 0.98 })

  // Mock price history (newest at right). Si hay hikeDeltaPct, el
  // último punto es más alto. Si no, planito o tendencia muy suave.
  const history = buildMockHistory(item)
  const sparkColor = item.hikeDeltaPct
    ? palette.urgency
    : item.status === 'paid'
    ? palette.success
    : theme.colors.textMuted

  const label =
    item.status === 'paid'
      ? `Pagado · día ${item.dayOfMonth}`
      : item.status === 'overdue'
      ? `Vencido hace ${Math.abs(item.daysUntil)}d`
      : item.daysUntil === 0
      ? 'Vence hoy'
      : item.daysUntil === 1
      ? 'Vence mañana'
      : `En ${item.daysUntil} días · día ${item.dayOfMonth}`

  return (
    <Pressable
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      accessibilityRole="button"
      accessibilityLabel={`${item.name}, ${label}, ${formatMoney(item.amount)}`}
    >
      <Animated.View
        style={[
          styles.row,
          press.animatedStyle,
          item.status === 'paid' ? { opacity: 0.55 } : null,
        ]}
      >
        <View style={[styles.dot, { backgroundColor: item.categoryColor }]} />
        <View style={styles.body}>
          <Text style={[styles.name, { color: theme.colors.text }]} numberOfLines={1}>
            {item.name}
          </Text>
          <Text style={[styles.label, { color: theme.colors.textMuted }]} numberOfLines={1}>
            {label}
          </Text>
        </View>

        <View style={styles.sparkBlock}>
          <Spark points={history} color={sparkColor} />
          {item.hikeDeltaPct ? (
            <Text style={[styles.sparkDelta, { color: palette.urgency }]}>
              +{item.hikeDeltaPct}%
            </Text>
          ) : null}
        </View>

        <Text style={[styles.amount, { color: theme.colors.text }]}>
          {formatMoney(item.amount)}
        </Text>
      </Animated.View>
    </Pressable>
  )
}

function buildMockHistory(item: FijoItem): number[] {
  const base = item.amount
  if (item.hikeDeltaPct) {
    const prev = base / (1 + item.hikeDeltaPct / 100)
    return [prev * 0.98, prev, prev, prev * 1.01, prev, base]
  }
  // Suave fluctuación
  return [
    base * 0.98,
    base * 1.01,
    base * 0.99,
    base * 1.0,
    base * 0.99,
    base,
  ]
}

function Spark({ points, color }: { points: number[]; color: string }) {
  const W = 56
  const H = 22
  const min = Math.min(...points)
  const max = Math.max(...points)
  const range = max - min || 1
  const xs = points.map((_, i) => (i / (points.length - 1)) * W)
  const ys = points.map((p) => H - ((p - min) / range) * H)
  const pathPoints = xs.map((x, i) => `${x},${ys[i]}`).join(' ')
  // Subtle filled area below the line for "tendency body"
  const areaD = `M0,${H} L${pathPoints.split(' ').join(' L')} L${W},${H} Z`
  return (
    <Svg width={W} height={H}>
      <Path d={areaD} fill={color} fillOpacity={0.12} />
      <Polyline
        points={pathPoints}
        fill="none"
        stroke={color}
        strokeWidth={1.6}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </Svg>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  body: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  name: {
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  label: {
    fontSize: 11,
    fontWeight: '500',
  },
  sparkBlock: {
    alignItems: 'flex-end',
    gap: 2,
  },
  sparkDelta: {
    fontSize: 9,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  amount: {
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: -0.3,
    fontVariant: ['tabular-nums'],
    minWidth: 80,
    textAlign: 'right',
  },
})
