import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import Animated, { Easing, FadeIn, FadeInDown } from 'react-native-reanimated'
import { MaterialIcons } from '@expo/vector-icons'
import i18n from '@/lib/i18n'
import { formatWeekdayDayMonth } from '@/utils/date-format'
import { motionDurations } from '@/lib/motion/tokens'
import { useAppTheme } from '@/theme/theme-provider'
import type { Category } from '@/features/categories/use-categories'
import type { ReviewRow } from '@/features/import-review/types'
import { INCOME_KIND_BY_KEY } from '@/features/income/income-kinds'

interface Props {
  rows: readonly ReviewRow[]
  categories: readonly Category[]
  expensesCount: number
  incomesCount: number
  skippedCount: number
  /** Jump straight back to a movement's edit step (tap on its row). */
  onJumpTo?: (rowId: string) => void
}

const EASE_IOS = Easing.bezier(0.32, 0.72, 0, 1)

/**
 * Final wizard step. A sober, scannable list of exactly what's about to
 * be committed — no celebration here on purpose: nothing has been saved
 * yet, so the moment is "confirm", not "done". The real celebration
 * (confetti) fires after the commit succeeds, where it belongs. Anything
 * skipped is noted in one quiet line at the bottom so the user keeps
 * track of what they left out.
 *
 * Read-only by design: the only actions are "Confirmar" (primary footer)
 * or "Volver a editar" (secondary footer). Another place to fiddle would
 * just invite infinite-loop indecision.
 */
export function ImportReviewSummary({
  rows,
  categories,
  expensesCount,
  incomesCount,
  skippedCount,
  onJumpTo,
}: Props) {
  const { theme } = useAppTheme()
  const { t } = useTranslation()
  const submittable = rows.filter((r) => r.kind !== 'skip')

  const categoryById = new Map(categories.map((c) => [c.id, c]))

  const subtitleParts: string[] = []
  if (expensesCount > 0) {
    subtitleParts.push(t('gastos:import.summary.expensesCount', { count: expensesCount }))
  }
  if (incomesCount > 0) {
    subtitleParts.push(t('gastos:import.summary.incomesCount', { count: incomesCount }))
  }
  const subtitle = subtitleParts.join(t('gastos:import.summary.and'))
  const isEmpty = expensesCount + incomesCount === 0

  return (
    <View style={styles.root}>
      <Animated.Text
        entering={FadeIn.duration(motionDurations.standard).easing(EASE_IOS)}
        style={[
          isEmpty ? styles.heading : styles.lead,
          { color: theme.colors.text },
        ]}
      >
        {isEmpty ? t('gastos:import.summary.nothingToLoad') : t('gastos:import.summary.willLoad', { summary: subtitle })}
      </Animated.Text>

      <View style={styles.list}>
        {submittable.map((row, idx) => (
          <SummaryItem
            key={row.id}
            row={row}
            categoryName={
              row.kind === 'expense' && row.categoryId
                ? (categoryById.get(row.categoryId)?.displayName ?? null)
                : null
            }
            // Cap the stagger at 5 items: with 8-12 movements the tail used
            // to land ~1s late and the user waited to read their own list.
            delay={40 + Math.min(idx, 5) * 60}
            onJumpTo={onJumpTo}
          />
        ))}
      </View>

      {skippedCount > 0 ? (
        <Animated.Text
          entering={FadeIn.duration(motionDurations.quick)
            .delay(40 + Math.min(submittable.length, 5) * 60 + 80)
            .easing(EASE_IOS)}
          style={[styles.skippedLine, { color: theme.colors.textMuted }]}
        >
          {t('gastos:import.summary.skippedLine', { count: skippedCount })}
        </Animated.Text>
      ) : null}
    </View>
  )
}

interface SummaryItemProps {
  row: ReviewRow
  categoryName: string | null
  delay: number
  onJumpTo?: (rowId: string) => void
}

/**
 * One light row per movement: description + amount on the baseline, a
 * muted meta line below. No card wrapper and no GASTO/INGRESO eyebrow —
 * the `+` sign and the primary tint on income already carry the kind, so
 * the label was just noise. Whitespace does the grouping.
 *
 * Tappable: a summary that lists what you're about to commit should let
 * you fix any line in one tap (jump straight to its edit step) instead of
 * "Volver a editar" + paging back one by one.
 */
function SummaryItem({ row, categoryName, delay, onJumpTo }: SummaryItemProps) {
  const { theme } = useAppTheme()
  const { t } = useTranslation()
  const sign = row.kind === 'income' ? '+' : ''
  const tint = row.kind === 'income' ? theme.colors.primary : theme.colors.text

  const meta = (() => {
    const dateLabel = formatRelativeDate(row.date)
    const sub =
      row.kind === 'income'
        ? t(INCOME_KIND_BY_KEY[row.incomeKind].labelKey)
        : (categoryName ?? '—')
    return `${dateLabel} · ${sub}`
  })()

  // One a11y node per movement, read as a single phrase. Without this the
  // '+' on income is silent and gasto/ingreso sound identical at the most
  // critical step (what you're about to load).
  const a11yLabel = t('gastos:import.summary.itemA11y', {
    kind: row.kind === 'income' ? t('gastos:import.incomeKind.incomeLabel') : t('common:terms.expense'),
    description: row.description,
    plus: sign === '+' ? t('gastos:import.summary.plusPrefix') : '',
    amount: formatThousands(row.amount),
    meta,
  })

  return (
    <Animated.View
      entering={FadeInDown.duration(motionDurations.standard)
        .delay(delay)
        .easing(EASE_IOS)}
    >
      <Pressable
        onPress={onJumpTo ? () => onJumpTo(row.id) : undefined}
        disabled={!onJumpTo}
        accessible
        accessibilityRole={onJumpTo ? 'button' : 'text'}
        accessibilityLabel={a11yLabel}
        accessibilityHint={onJumpTo ? t('gastos:import.summary.editHint') : undefined}
        style={({ pressed }) => [
          styles.item,
          pressed && onJumpTo ? styles.itemPressed : null,
        ]}
      >
        <View style={styles.itemMain}>
          <Text
            style={[styles.itemDescription, { color: theme.colors.text }]}
            numberOfLines={1}
            ellipsizeMode="tail"
          >
            {row.description}
          </Text>
          <Text style={[styles.itemAmount, { color: tint }]} numberOfLines={1}>
            {sign}${formatThousands(row.amount)}
          </Text>
        </View>
        <View style={styles.itemBottom}>
          <Text
            style={[styles.itemMeta, { color: theme.colors.textMuted }]}
            numberOfLines={1}
          >
            {meta}
          </Text>
          {onJumpTo ? (
            <MaterialIcons
              name="chevron-right"
              size={16}
              color={theme.colors.textMuted}
            />
          ) : null}
        </View>
      </Pressable>
    </Animated.View>
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
  if (diffDays === 0) return i18n.t('gastos:import.relativeDate.today')
  if (diffDays === -1) return i18n.t('gastos:import.relativeDate.yesterday')
  if (diffDays === 1) return i18n.t('gastos:import.relativeDate.tomorrow')
  return formatWeekdayDayMonth(target)
}

const styles = StyleSheet.create({
  root: {
    alignItems: 'stretch',
    gap: 8,
    paddingTop: 8,
  },
  heading: {
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: -0.4,
    textAlign: 'center',
  },
  lead: {
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: -0.3,
    marginBottom: 4,
  },
  list: { gap: 16 },
  item: { gap: 3 },
  itemPressed: { opacity: 0.55 },
  itemBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
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
    fontWeight: '600',
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
  skippedLine: {
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 4,
  },
})
