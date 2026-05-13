import { Pressable, StyleSheet, Text, View } from 'react-native'
import Animated from 'react-native-reanimated'
import { MaterialIcons } from '@expo/vector-icons'
import { formatMoney } from '@/utils/money'
import { usePressScale } from '@/hooks/use-press-scale'
import { useAppTheme } from '@/theme/theme-provider'
import { buildProximosPalette } from './proximos-colors'
import type { FijoItem } from './fijo-list-sample'

interface RowStatusIconProps {
  item: FijoItem
}

/**
 * Variant E · Status icon-led. El icon de status va a la izquierda
 * como ancla emocional (check para paid, schedule para pending,
 * warning para overdue). Tinted bg behind el icon en su color
 * correspondiente. Estilo "task list / inbox" — muy reconocible.
 *
 * El category color queda en un dot pequeño al lado del name (no es
 * el dato dominante). El status visual es el primario.
 */
export function RowStatusIcon({ item }: RowStatusIconProps) {
  const { theme } = useAppTheme()
  const palette = buildProximosPalette(theme)
  const press = usePressScale({ pressedScale: 0.98 })

  const isPaid = item.status === 'paid'
  const isOverdue = item.status === 'overdue'
  const isUrgent = !isPaid && item.daysUntil <= 1

  const statusColor = isPaid
    ? palette.success
    : isOverdue
    ? palette.urgencyStrong
    : isUrgent
    ? palette.urgency
    : theme.colors.textMuted

  const statusBg = isPaid
    ? palette.successSubtle
    : isOverdue
    ? palette.urgencyBadgeBg
    : isUrgent
    ? palette.urgencyBadgeBg
    : theme.isDark
    ? 'rgba(242,234,211,0.08)'
    : 'rgba(18,33,26,0.05)'

  const statusIcon: 'check' | 'warning' | 'schedule' = isPaid
    ? 'check'
    : isOverdue
    ? 'warning'
    : 'schedule'

  const label = isPaid
    ? `Pagado · día ${item.dayOfMonth}`
    : isOverdue
    ? `Vencido hace ${Math.abs(item.daysUntil)} días`
    : item.daysUntil === 0
    ? `Vence hoy · día ${item.dayOfMonth}`
    : item.daysUntil === 1
    ? `Vence mañana · día ${item.dayOfMonth}`
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
          isPaid ? { opacity: 0.65 } : null,
        ]}
      >
        <View
          style={[
            styles.iconTile,
            {
              backgroundColor: statusBg,
              borderColor: statusColor + (theme.isDark ? '55' : '33'),
            },
          ]}
        >
          <MaterialIcons name={statusIcon} size={18} color={statusColor} />
        </View>
        <View style={styles.body}>
          <View style={styles.nameRow}>
            <View
              style={[styles.catDot, { backgroundColor: item.categoryColor }]}
            />
            <Text style={[styles.name, { color: theme.colors.text }]} numberOfLines={1}>
              {item.name}
            </Text>
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
          <Text style={[styles.label, { color: statusColor }]} numberOfLines={1}>
            {label}
          </Text>
        </View>
        <Text style={[styles.amount, { color: theme.colors.text }]}>
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
    paddingVertical: 10,
  },
  iconTile: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  body: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  catDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  name: {
    fontSize: 14,
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
    fontSize: 11,
    fontWeight: '600',
  },
  amount: {
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: -0.3,
    fontVariant: ['tabular-nums'],
  },
})
