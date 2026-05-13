import { Pressable, StyleSheet, Text, View } from 'react-native'
import Animated from 'react-native-reanimated'
import { MaterialIcons } from '@expo/vector-icons'
import { formatMoney } from '@/utils/money'
import { usePressScale } from '@/hooks/use-press-scale'
import { useAppTheme } from '@/theme/theme-provider'
import { buildProximosPalette } from './proximos-colors'
import type { FijoItem } from './fijo-list-sample'

interface RowStripeProps {
  item: FijoItem
}

/**
 * Variant C · Accent stripe + two-line. Una stripe vertical (2pt
 * ancho) del color de categoría ancla el row a la izquierda — NO es
 * un border de card (que sería ban impeccable), es una "guía editorial"
 * tipo el accent rule del Wrapped. Two-line typography:
 *
 *   { Stripe }   Name 15pt 800
 *                Due label 11pt muted
 *
 *                              { Amount 16pt }
 *
 * Si hay hike: stripe se tinta peach. Si paid: stripe lime.
 */
export function RowStripe({ item }: RowStripeProps) {
  const { theme } = useAppTheme()
  const palette = buildProximosPalette(theme)
  const press = usePressScale({ pressedScale: 0.98 })

  // Stripe color override en estados especiales
  const stripeColor =
    item.status === 'overdue'
      ? palette.urgencyStrong
      : item.status === 'paid'
      ? palette.success
      : item.hikeDeltaPct
      ? palette.urgency
      : item.categoryColor

  const label =
    item.status === 'paid'
      ? `Pagado · día ${item.dayOfMonth}`
      : item.status === 'overdue'
      ? `Vencido hace ${Math.abs(item.daysUntil)} días`
      : item.daysUntil === 0
      ? 'Vence hoy'
      : item.daysUntil === 1
      ? 'Vence mañana'
      : `Vence en ${item.daysUntil} días · ${item.category}`

  const labelColor =
    item.status === 'overdue'
      ? palette.urgencyStrong
      : item.daysUntil <= 1 && item.status !== 'paid'
      ? palette.urgency
      : theme.colors.textMuted

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
        <View style={[styles.stripe, { backgroundColor: stripeColor }]} />
        <View style={styles.body}>
          <View style={styles.nameRow}>
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
                <MaterialIcons name="trending-up" size={9} color={palette.urgency} />
                <Text style={[styles.hikeText, { color: palette.urgency }]}>
                  +{item.hikeDeltaPct}%
                </Text>
              </View>
            ) : null}
          </View>
          <Text style={[styles.label, { color: labelColor }]} numberOfLines={1}>
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
    alignItems: 'stretch',
    gap: 12,
    paddingVertical: 10,
    minHeight: 52,
  },
  stripe: {
    width: 2.5,
    borderRadius: 2,
    alignSelf: 'stretch',
  },
  body: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
    gap: 3,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  name: {
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: -0.3,
    flexShrink: 1,
  },
  hikeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
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
    letterSpacing: -0.1,
  },
  amount: {
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: -0.3,
    fontVariant: ['tabular-nums'],
    alignSelf: 'center',
  },
})
