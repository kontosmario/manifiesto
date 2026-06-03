import { Pressable, StyleSheet, Text, View } from 'react-native'
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'
import { useAppTheme } from '@/theme/theme-provider'
import type { ReviewRow } from '@/features/import-review/types'

interface Props {
  row: ReviewRow
  invalid: boolean
  onExpand: () => void
}

const KIND_LABEL: Record<ReviewRow['kind'], string> = {
  expense: 'Gasto',
  income: 'Ingreso',
  skip: 'Saltear',
}

export function ImportReviewRowCollapsed({ row, invalid, onExpand }: Props) {
  const { theme } = useAppTheme()
  const press = useSharedValue(1)

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: press.value }],
  }))

  const kindBg =
    row.kind === 'expense'
      ? theme.colors.primarySurface
      : row.kind === 'income'
        ? `${theme.colors.primary}22`
        : theme.colors.surfaceMuted
  const kindFg =
    row.kind === 'skip' ? theme.colors.textMuted : theme.colors.primary

  const amountColor =
    row.amount === 0 ? theme.colors.textMuted : theme.colors.text
  const amountSign = row.source.transaction.primaryAmount.sign === -1 ? '−' : '+'

  const dateLabel = formatRelativeDate(row.date)
  const secondary = [row.description, dateLabel].filter((s) => s !== '').join(' · ')

  const hasWarning = row.warnings.length > 0

  return (
    <Animated.View style={animatedStyle}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Editar ${row.description}`}
        onPress={onExpand}
        onPressIn={() => {
          press.value = withTiming(0.97, {
            duration: 120,
            easing: Easing.bezier(0.32, 0.72, 0, 1),
          })
        }}
        onPressOut={() => {
          press.value = withTiming(1, {
            duration: 120,
            easing: Easing.bezier(0.32, 0.72, 0, 1),
          })
        }}
        style={[
          styles.card,
          {
            backgroundColor: theme.isDark ? theme.colors.surfaceMuted : theme.colors.creamCard,
            borderColor: invalid ? theme.colors.danger : theme.colors.line,
          },
        ]}
      >
        <View style={styles.topRow}>
          <View style={[styles.kindPill, { backgroundColor: kindBg }]}>
            <Text style={[styles.kindLabel, { color: kindFg }]}>
              {KIND_LABEL[row.kind]}
            </Text>
          </View>
          <Text style={[styles.amount, { color: amountColor }]} numberOfLines={1}>
            {amountSign} ${formatThousands(row.amount)}
          </Text>
        </View>
        <View style={styles.bottomRow}>
          <Text
            style={[styles.secondary, { color: theme.colors.textMuted }]}
            numberOfLines={1}
            ellipsizeMode="tail"
          >
            {secondary}
          </Text>
          {hasWarning ? (
            <View style={[styles.warnDot, { backgroundColor: theme.colors.warning }]} />
          ) : null}
        </View>
      </Pressable>
    </Animated.View>
  )
}

function formatThousands(n: number): string {
  // es-AR thousands separator: '.'
  const fixed = Math.abs(n).toFixed(2)
  const [intPart, decPart] = fixed.split('.')
  const withDots = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return decPart === '00' ? withDots : `${withDots},${decPart}`
}

function formatRelativeDate(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return iso
  const target = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const targetMid = new Date(target)
  targetMid.setHours(0, 0, 0, 0)
  const diffDays = Math.round((targetMid.getTime() - today.getTime()) / 86_400_000)
  if (diffDays === 0) return 'hoy'
  if (diffDays === -1) return 'ayer'
  if (diffDays === 1) return 'mañana'
  const weekdays = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']
  const months = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
  return `${weekdays[target.getDay()]} ${target.getDate()} ${months[target.getMonth()]}`
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 6,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  kindPill: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 999,
  },
  kindLabel: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  amount: {
    fontSize: 18,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
    letterSpacing: -0.4,
  },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  secondary: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
  },
  warnDot: {
    width: 6,
    height: 6,
    borderRadius: 999,
  },
})
