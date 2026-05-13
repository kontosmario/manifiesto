import { Pressable, StyleSheet, Text, View } from 'react-native'
import Animated from 'react-native-reanimated'
import { MaterialIcons } from '@expo/vector-icons'
import { formatMoney } from '@/utils/money'
import { usePressScale } from '@/hooks/use-press-scale'
import { useAppTheme } from '@/theme/theme-provider'
import { buildProximosPalette } from './proximos-colors'
import type { FijoItem } from './fijo-list-sample'

interface RowEditorialProps {
  item: FijoItem
}

/**
 * Variant A · Editorial row. Misma DNA que el FijoRowMini de Smart
 * sort, con detalles refinados: cat dot 8pt + name 15pt 700 + status
 * label tiny 10pt 900 abajo + amount big tabular-nums right-aligned.
 * Sin chips pastel, sin emojis, restraint puro.
 *
 * Hike badge inline al lado del name. Pagados → dimmed 0.5 opacity.
 */
export function RowEditorial({ item }: RowEditorialProps) {
  const { theme } = useAppTheme()
  const palette = buildProximosPalette(theme)
  const press = usePressScale({ pressedScale: 0.98 })

  const statusColor =
    item.status === 'overdue'
      ? palette.urgencyStrong
      : item.status === 'paid'
      ? palette.success
      : item.daysUntil <= 1
      ? palette.urgency
      : theme.colors.textMuted

  const label =
    item.status === 'paid'
      ? `PAGADO · DÍA ${item.dayOfMonth}`
      : item.status === 'overdue'
      ? `VENCIÓ HACE ${Math.abs(item.daysUntil)}D · DÍA ${item.dayOfMonth}`
      : item.daysUntil === 0
      ? `HOY · DÍA ${item.dayOfMonth}`
      : item.daysUntil === 1
      ? `MAÑANA · DÍA ${item.dayOfMonth}`
      : `EN ${item.daysUntil}D · DÍA ${item.dayOfMonth}`

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
          item.status === 'paid' ? { opacity: 0.5 } : null,
        ]}
      >
        <View style={[styles.dot, { backgroundColor: item.categoryColor }]} />
        <View style={styles.body}>
          <View style={styles.titleRow}>
            <Text style={[styles.name, { color: theme.colors.text }]} numberOfLines={1}>
              {item.name}
            </Text>
            {item.status === 'paid' ? (
              <MaterialIcons name="check" size={14} color={palette.success} />
            ) : null}
            {item.hikeDeltaPct ? (
              <View
                style={[
                  styles.hikeBadge,
                  {
                    borderColor: palette.urgencyBadgeBorder,
                    backgroundColor: palette.urgencyBadgeBg,
                  },
                ]}
              >
                <Text style={[styles.hikeText, { color: palette.urgency }]}>
                  ↑{item.hikeDeltaPct}%
                </Text>
              </View>
            ) : null}
          </View>
          <Text style={[styles.label, { color: statusColor }]}>{label}</Text>
        </View>
        <Text
          style={[
            styles.amount,
            { color: theme.colors.text },
          ]}
        >
          {formatMoney(item.amount)}
        </Text>
      </Animated.View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  body: {
    flex: 1,
    gap: 3,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  name: {
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: -0.2,
    flexShrink: 1,
  },
  hikeBadge: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 999,
    borderWidth: 1,
  },
  hikeText: {
    fontSize: 9,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  label: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.2,
  },
  amount: {
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: -0.3,
    fontVariant: ['tabular-nums'],
  },
})
