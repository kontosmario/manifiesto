import { Pressable, StyleSheet, Text, View } from 'react-native'
import Animated from 'react-native-reanimated'
import { MaterialIcons } from '@expo/vector-icons'
import { usePressScale } from '@/hooks/use-press-scale'
import { formatMoney } from '@/utils/money'
import { useAppTheme } from '@/theme/theme-provider'
import { buildProximosPalette } from './proximos-colors'
import type { FijoItem } from './fijo-list-sample'

interface FijoRowMiniProps {
  item: FijoItem
  /** Cuando true, el row se renderea atenuado (paid en una vista por
   *  pagar, o "ya pasaron" en time-grouped). */
  dimmed?: boolean
  /** Si se omite, se infiere del item.status. Sirve para que las
   *  variantes sobreescriban el label (e.g. time-grouped puede mostrar
   *  "VENCIÓ HACE 5d" en vez de "VENCIDO"). */
  trailingLabel?: string
}

/**
 * Mini FijoRow para las preview variants. NO es el FijoRow real (ese
 * vive en components/fijos/fijo-row.tsx, 448 LOC con sparklines, hike
 * arrows, edit/delete actions). Esta es solo para que las variantes
 * de Tabs vean cómo se sienten end-to-end.
 */
export function FijoRowMini({ item, dimmed, trailingLabel }: FijoRowMiniProps) {
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
    trailingLabel ??
    (item.status === 'paid'
      ? 'PAGADO'
      : item.status === 'overdue'
      ? `VENCIÓ HACE ${Math.abs(item.daysUntil)}D`
      : item.daysUntil === 0
      ? 'HOY'
      : item.daysUntil === 1
      ? 'MAÑANA'
      : `EN ${item.daysUntil}D`)

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
          dimmed ? { opacity: 0.45 } : null,
        ]}
      >
        <View style={[styles.catDot, { backgroundColor: item.categoryColor }]} />
        <View style={styles.body}>
          <View style={styles.titleRow}>
            <Text style={[styles.name, { color: theme.colors.text }]} numberOfLines={1}>
              {item.name}
            </Text>
            {item.status === 'paid' ? (
              <MaterialIcons name="check" size={13} color={palette.success} />
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
            { color: dimmed ? theme.colors.textMuted : theme.colors.text },
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
    gap: 10,
    paddingVertical: 10,
  },
  catDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  body: {
    flex: 1,
    gap: 2,
  },
  titleRow: {
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
    paddingHorizontal: 4,
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
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  amount: {
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: -0.2,
    fontVariant: ['tabular-nums'],
  },
})
