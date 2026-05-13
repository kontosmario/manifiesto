import { Pressable, StyleSheet, Text, View } from 'react-native'
import Animated from 'react-native-reanimated'
import { MaterialIcons } from '@expo/vector-icons'
import { formatMoney } from '@/utils/money'
import { usePressScale } from '@/hooks/use-press-scale'
import { useAppTheme } from '@/theme/theme-provider'
import { buildProximosPalette } from './proximos-colors'
import type { FijoItem } from './fijo-list-sample'

interface RowDayMarkerProps {
  item: FijoItem
}

/**
 * Variant D · Calendar day marker. Cada row tiene un "día del mes"
 * visual a la izquierda — círculo o cuadradito con el número del día
 * que paga el fijo (e.g. "5" para Alquiler que paga el 5). El usuario
 * mapea cuándo se paga sin leer el dueLabel.
 *
 * El día se tinta según status:
 *   paid    → success ring + check chico abajo
 *   overdue → urgency-strong fill + warning
 *   pending → cat color outline + day number
 *
 * El día está en CAJA cuadrada estilo "ticket/agenda".
 */
export function RowDayMarker({ item }: RowDayMarkerProps) {
  const { theme } = useAppTheme()
  const palette = buildProximosPalette(theme)
  const press = usePressScale({ pressedScale: 0.98 })

  const isPaid = item.status === 'paid'
  const isOverdue = item.status === 'overdue'

  const dayBoxStyle = isOverdue
    ? {
        backgroundColor: palette.urgencyStrong,
        borderColor: palette.urgencyStrong,
        textColor: theme.isDark ? '#0F2E1F' : '#FFFBF2',
      }
    : isPaid
    ? {
        backgroundColor: 'transparent',
        borderColor: palette.success,
        textColor: palette.success,
      }
    : {
        backgroundColor: 'transparent',
        borderColor: item.categoryColor,
        textColor: theme.colors.text,
      }

  const label =
    item.status === 'paid'
      ? `Pagado · ${item.category}`
      : item.status === 'overdue'
      ? `Vencido hace ${Math.abs(item.daysUntil)} días`
      : item.daysUntil === 0
      ? `Vence HOY · ${item.category}`
      : item.daysUntil === 1
      ? `Vence MAÑANA · ${item.category}`
      : `En ${item.daysUntil} días · ${item.category}`

  return (
    <Pressable
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      accessibilityRole="button"
      accessibilityLabel={`${item.name}, día ${item.dayOfMonth}, ${label}, ${formatMoney(item.amount)}`}
    >
      <Animated.View
        style={[
          styles.row,
          press.animatedStyle,
          isPaid ? { opacity: 0.6 } : null,
        ]}
      >
        <View
          style={[
            styles.dayBox,
            {
              backgroundColor: dayBoxStyle.backgroundColor,
              borderColor: dayBoxStyle.borderColor,
            },
          ]}
        >
          <Text style={[styles.dayNum, { color: dayBoxStyle.textColor }]}>
            {item.dayOfMonth}
          </Text>
          {isPaid ? (
            <MaterialIcons
              name="check"
              size={9}
              color={palette.success}
              style={styles.dayCheck}
            />
          ) : null}
        </View>
        <View style={styles.body}>
          <View style={styles.nameRow}>
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
          <Text
            style={[
              styles.label,
              {
                color: isOverdue
                  ? palette.urgencyStrong
                  : item.daysUntil <= 1 && !isPaid
                  ? palette.urgency
                  : theme.colors.textMuted,
              },
            ]}
            numberOfLines={1}
          >
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
  dayBox: {
    width: 36,
    height: 36,
    borderRadius: 8,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  dayNum: {
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: -0.5,
    fontVariant: ['tabular-nums'],
  },
  dayCheck: {
    position: 'absolute',
    bottom: 1,
    right: 2,
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
