import { StyleSheet, Text, View } from 'react-native'
import { BrandedPanel } from '@/components/ui/branded-panel'
import { ErrorState } from '@/components/ui/error-state'
import { EmptyState } from '@/components/ui/empty-state'
import { LoadingBlock } from '@/components/ui/loading-block'
import { SectionHeader } from '@/components/ui/section-header'
import { withAlpha } from '@/theme/color-utils'
import { radii } from '@/theme/palette'
import { useAppTheme } from '@/theme/theme-provider'
import { currencyFormatter } from '@/utils/money'
import { type Expense } from '@/features/expenses/use-expenses'

const shortDateFormatter = new Intl.DateTimeFormat('es-AR', {
  day: '2-digit',
  month: 'short',
})

interface HomeActivityCardProps {
  categoryNameById: Map<string, string>
  errorMessage?: string
  isLoading: boolean
  onRetry?: () => void
  recentExpenses: Expense[]
}

export function HomeActivityCard({
  categoryNameById,
  errorMessage,
  isLoading,
  onRetry,
  recentExpenses,
}: HomeActivityCardProps) {
  const { theme } = useAppTheme()
  const activityItemPalette = theme.isDark
    ? {
        backgroundColor: theme.colors.surfaceMuted,
        borderColor: theme.colors.border,
        dotColor: theme.colors.primary,
      }
    : {
        backgroundColor: withAlpha(theme.colors.backgroundElevated, 0.98),
        borderColor: withAlpha(theme.colors.primary, 0.1),
        dotColor: theme.colors.primaryStrong,
      }

  return (
    <BrandedPanel style={styles.activityCard}>
      <SectionHeader
        subtitle="Solo tres eventos visibles para no empujar scroll innecesario."
        title="Últimos movimientos"
      />

      {isLoading ? <LoadingBlock label="Cargando actividad reciente..." /> : null}

      {!isLoading && errorMessage && recentExpenses.length === 0 ? (
        <ErrorState
          description={errorMessage}
          title="No pudimos cargar la actividad"
          onAction={onRetry}
        />
      ) : null}

      {!isLoading && !errorMessage && recentExpenses.length === 0 ? (
        <EmptyState
          icon="receipt-long"
          subtitle="Todavía no hay gastos cargados en este ciclo."
          title="Sin movimientos"
        />
      ) : null}

      <View style={styles.activityList}>
        {recentExpenses.map((expense) => (
          <View
            key={expense.id}
            style={[
              styles.activityItem,
              {
                backgroundColor: activityItemPalette.backgroundColor,
                borderColor: activityItemPalette.borderColor,
              },
            ]}
          >
            <View style={styles.activityLeading}>
              <View style={[styles.activityDot, { backgroundColor: activityItemPalette.dotColor }]} />
              <View style={styles.activityMain}>
                <Text numberOfLines={1} style={[styles.activityTitle, { color: theme.colors.text }]}>
                  {expense.description}
                </Text>
                <Text style={[styles.activityMeta, { color: theme.colors.textMuted }]}>
                  {categoryNameById.get(expense.category_id) ?? 'Sin categoría'}
                </Text>
              </View>
            </View>
            <View style={styles.activityTrailing}>
              <Text style={[styles.activityAmount, { color: theme.colors.text }]}>
                {currencyFormatter.format(expense.price)}
              </Text>
              <Text style={[styles.activityDate, { color: theme.colors.textSoft }]}>
                {shortDateFormatter.format(new Date(expense.created_at))}
              </Text>
            </View>
          </View>
        ))}
      </View>
    </BrandedPanel>
  )
}

const styles = StyleSheet.create({
  activityCard: {
    gap: 18,
  },
  activityList: {
    gap: 10,
  },
  activityItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    borderRadius: radii.xl,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  activityLeading: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  activityDot: {
    width: 10,
    height: 10,
    borderRadius: radii.pill,
  },
  activityMain: {
    flex: 1,
    gap: 4,
  },
  activityTitle: {
    fontSize: 15,
    fontWeight: '800',
  },
  activityMeta: {
    fontSize: 13,
  },
  activityAmount: {
    fontSize: 15,
    fontWeight: '800',
  },
  activityTrailing: {
    alignItems: 'flex-end',
    gap: 4,
  },
  activityDate: {
    fontSize: 12,
    fontWeight: '700',
  },
})
