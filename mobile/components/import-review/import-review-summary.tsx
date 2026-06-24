import { useEffect } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated'
import { MaterialIcons } from '@expo/vector-icons'
import { motionDurations, motionSprings } from '@/lib/motion/tokens'
import { useAppTheme } from '@/theme/theme-provider'
import type { Category } from '@/features/categories/use-categories'
import type { IncomeKind, ReviewRow } from '@/features/import-review/types'

interface Props {
  rows: readonly ReviewRow[]
  categories: readonly Category[]
  expensesCount: number
  incomesCount: number
  skippedCount: number
}

const EASE_IOS = Easing.bezier(0.32, 0.72, 0, 1)

const INCOME_KIND_LABELS: Record<IncomeKind, string> = {
  transfer: 'Transferencia',
  bonus: 'Bono',
  gift: 'Regalo',
  other: 'Otro',
}

/**
 * Final wizard step. Lays out everything the user is about to commit
 * in a single scannable list with a celebratory header — the "you're
 * about to ship" moment. Anything marked as `skip` is summarized in a
 * dimmed chip at the bottom so the user doesn't lose track of what
 * they de-selected.
 *
 * No editing happens here; the only actions are "Confirmar" (primary
 * footer) or "Volver a editar" (secondary footer). Keeping this step
 * read-only is intentional: the wizard's job is to commit, and giving
 * the user another place to fiddle invites infinite-loop indecision.
 */
export function ImportReviewSummary({
  rows,
  categories,
  expensesCount,
  incomesCount,
  skippedCount,
}: Props) {
  const { theme } = useAppTheme()
  const submittable = rows.filter((r) => r.kind !== 'skip')

  const categoryById = new Map(categories.map((c) => [c.id, c]))

  const subtitleParts: string[] = []
  if (expensesCount > 0) {
    subtitleParts.push(
      `${expensesCount} gasto${expensesCount === 1 ? '' : 's'}`,
    )
  }
  if (incomesCount > 0) {
    subtitleParts.push(
      `${incomesCount} ingreso${incomesCount === 1 ? '' : 's'}`,
    )
  }
  const subtitle = subtitleParts.join(' y ')

  return (
    <View style={styles.root}>
      <CelebrationIcon color={theme.colors.primary} iconColor={theme.colors.textOnPrimary} />
      <Animated.Text
        entering={FadeIn.duration(motionDurations.standard).delay(120).easing(EASE_IOS)}
        style={[styles.heading, { color: theme.colors.text }]}
      >
        {expensesCount + incomesCount === 0 ? 'Sin nada para cargar' : 'Casi listo'}
      </Animated.Text>
      {subtitle !== '' ? (
        <Animated.Text
          entering={FadeIn.duration(motionDurations.standard).delay(180).easing(EASE_IOS)}
          style={[styles.subtitle, { color: theme.colors.textMuted }]}
        >
          Vas a cargar {subtitle}.
        </Animated.Text>
      ) : null}

      <View style={styles.list}>
        {submittable.map((row, idx) => (
          <SummaryItem
            key={row.id}
            row={row}
            categoryName={
              row.kind === 'expense' && row.categoryId
                ? (categoryById.get(row.categoryId)?.name ?? null)
                : null
            }
            delay={240 + idx * 70}
          />
        ))}
      </View>

      {skippedCount > 0 ? (
        <Animated.View
          entering={FadeIn.duration(motionDurations.quick)
            .delay(240 + submittable.length * 70 + 80)
            .easing(EASE_IOS)}
          style={[
            styles.skippedChip,
            {
              backgroundColor: theme.colors.surfaceMuted,
              borderColor: theme.colors.line,
            },
          ]}
        >
          <MaterialIcons
            name="block"
            size={14}
            color={theme.colors.textMuted}
          />
          <Text style={[styles.skippedLabel, { color: theme.colors.textMuted }]}>
            {skippedCount} movimiento{skippedCount === 1 ? '' : 's'} saltado
            {skippedCount === 1 ? '' : 's'} (no se carga
            {skippedCount === 1 ? '' : 'n'})
          </Text>
        </Animated.View>
      ) : null}
    </View>
  )
}

interface SummaryItemProps {
  row: ReviewRow
  categoryName: string | null
  delay: number
}

function SummaryItem({ row, categoryName, delay }: SummaryItemProps) {
  const { theme } = useAppTheme()
  const sign = row.kind === 'income' ? '+' : ''
  const tint = row.kind === 'income' ? theme.colors.primary : theme.colors.text
  const kindLabel = row.kind === 'income' ? 'INGRESO' : 'GASTO'
  const kindColor =
    row.kind === 'income' ? theme.colors.primary : theme.colors.textMuted

  const meta = (() => {
    const dateLabel = formatRelativeDate(row.date)
    const sub =
      row.kind === 'income'
        ? INCOME_KIND_LABELS[row.incomeKind]
        : (categoryName ?? '—')
    return `${dateLabel} · ${sub}`
  })()

  return (
    <Animated.View
      entering={FadeInDown.duration(motionDurations.standard)
        .delay(delay)
        .easing(EASE_IOS)}
      style={[
        styles.item,
        {
          backgroundColor: theme.isDark
            ? theme.colors.surfaceMuted
            : theme.colors.creamCard,
          borderColor: theme.colors.line,
        },
      ]}
    >
      <View style={styles.itemTop}>
        <Text style={[styles.itemKind, { color: kindColor }]}>{kindLabel}</Text>
      </View>
      <View style={styles.itemMain}>
        <Text
          style={[styles.itemDescription, { color: theme.colors.text }]}
          numberOfLines={1}
          ellipsizeMode="tail"
        >
          {row.description}
        </Text>
        <Text
          style={[styles.itemAmount, { color: tint }]}
          numberOfLines={1}
        >
          {sign}${formatThousands(row.amount)}
        </Text>
      </View>
      <Text
        style={[styles.itemMeta, { color: theme.colors.textMuted }]}
        numberOfLines={1}
      >
        {meta}
      </Text>
    </Animated.View>
  )
}

/**
 * Big circular check that does a spring-bounce-in with a brief halo
 * pulse. Single moment of celebration to mark "you made it through the
 * review, now confirm".
 */
function CelebrationIcon({ color, iconColor }: { color: string; iconColor: string }) {
  const scale = useSharedValue(0.4)
  const halo = useSharedValue(0)

  useEffect(() => {
    scale.value = withDelay(40, withSpring(1, motionSprings.celebrate))
    halo.value = withDelay(
      40,
      withSequence(
        withTiming(1, { duration: motionDurations.standard, easing: EASE_IOS }),
        withTiming(0, { duration: motionDurations.deliberate, easing: EASE_IOS }),
      ),
    )
  }, [scale, halo])

  const circleStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }))

  const haloStyle = useAnimatedStyle(() => ({
    opacity: halo.value * 0.4,
    transform: [{ scale: 0.9 + halo.value * 0.7 }],
  }))

  return (
    <View style={styles.iconWrap}>
      <Animated.View
        style={[
          styles.halo,
          haloStyle,
          { backgroundColor: color },
        ]}
        pointerEvents="none"
      />
      <Animated.View
        style={[
          styles.iconCircle,
          circleStyle,
          { backgroundColor: color },
        ]}
      >
        <MaterialIcons name="check" size={36} color={iconColor} />
      </Animated.View>
    </View>
  )
}

function formatThousands(n: number): string {
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
  const diffDays = Math.round(
    (targetMid.getTime() - today.getTime()) / 86_400_000,
  )
  if (diffDays === 0) return 'hoy'
  if (diffDays === -1) return 'ayer'
  if (diffDays === 1) return 'mañana'
  const weekdays = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']
  const months = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
  return `${weekdays[target.getDay()]} ${target.getDate()} ${months[target.getMonth()]}`
}

const styles = StyleSheet.create({
  root: {
    alignItems: 'stretch',
    gap: 8,
    paddingTop: 8,
  },
  iconWrap: {
    alignSelf: 'center',
    width: 72,
    height: 72,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  halo: {
    position: 'absolute',
    width: 72,
    height: 72,
    borderRadius: 999,
  },
  iconCircle: {
    width: 56,
    height: 56,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heading: {
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: -0.4,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: -0.1,
    textAlign: 'center',
    marginBottom: 8,
  },
  list: { gap: 8 },
  item: {
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 4,
  },
  itemTop: { flexDirection: 'row', alignItems: 'center' },
  itemKind: {
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1,
  },
  itemMain: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 12,
  },
  itemDescription: {
    flex: 1,
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  itemAmount: {
    fontSize: 15,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
    letterSpacing: -0.3,
  },
  itemMeta: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.1,
  },
  skippedChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    alignSelf: 'center',
    marginTop: 4,
  },
  skippedLabel: {
    fontSize: 11,
    fontWeight: '700',
  },
})
