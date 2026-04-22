import { StyleSheet, Text, View, Pressable } from 'react-native'
import { CategoryBadge } from '@/components/ui/category-badge'
import { EmptyState } from '@/components/ui/empty-state'
import { ErrorState } from '@/components/ui/error-state'
import { ListRowSkeleton } from '@/components/ui/skeleton-layouts'
import { SwipeableRow, type SwipeAction } from '@/components/ui/swipeable-row'
import { errorMessages } from '@/lib/copy/states'
import { type DashboardErrorKind } from '@/features/home/home-dashboard-model'
import type { Expense } from '@/features/expenses/use-expenses'
import { radii } from '@/theme/palette'
import { typography } from '@/theme/typography'
import { useAppTheme } from '@/theme/theme-provider'

interface HomeActivitySectionProps {
  expenses: Expense[]
  categoryNameById: Map<string, string>
  isLoading: boolean
  errorKind?: DashboardErrorKind
  onDelete: (expenseId: string) => void
  onRetry: () => void
  onViewAll: () => void
  onAddFirst: () => void
}

export function HomeActivitySection({
  expenses,
  categoryNameById,
  isLoading,
  errorKind,
  onDelete,
  onRetry,
  onViewAll,
  onAddFirst,
}: HomeActivitySectionProps) {
  const { theme } = useAppTheme()

  return (
    <View>
      <View style={styles.header}>
        <Text style={[typography.eyebrow, { color: theme.colors.textMuted }]}>Reciente</Text>
        {expenses.length > 0 ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Ver todo el historial"
            onPress={onViewAll}
            hitSlop={10}
          >
            <Text style={[typography.buttonCompact, { color: theme.colors.primaryStrong }]}>
              Ver todos
            </Text>
          </Pressable>
        ) : null}
      </View>

      {isLoading ? (
        <View style={styles.listContainer}>
          <ListRowSkeleton rows={3} />
        </View>
      ) : errorKind ? (
        <ErrorState
          description={errorKind === 'network' ? errorMessages.network : errorMessages.server}
          onAction={onRetry}
        />
      ) : expenses.length === 0 ? (
        <EmptyState
          icon="receipt-long"
          stateKey="expensesThisCycle"
          action={{ label: 'Registrar primer gasto', onPress: onAddFirst }}
        />
      ) : (
        <View
          style={[
            styles.listContainer,
            {
              backgroundColor: theme.colors.surface,
              shadowColor: '#000',
            },
          ]}
        >
          {expenses.map((expense, index) => {
            const categoryName =
              categoryNameById.get(expense.category_id) ?? 'Sin categoría'
            const dangerAction: SwipeAction = {
              label: 'Eliminar',
              tone: 'danger',
              onPress: () => onDelete(expense.id),
            }
            const amount = Math.round(Math.abs(Number(expense.price ?? 0)))
            return (
              <SwipeableRow
                key={expense.id}
                accessibilityHint="Desliza hacia la izquierda para eliminar"
                rightActions={[dangerAction]}
              >
                <View
                  style={[
                    styles.row,
                    index < expenses.length - 1 && {
                      borderBottomWidth: StyleSheet.hairlineWidth,
                      borderBottomColor: theme.colors.border,
                    },
                  ]}
                >
                  <CategoryBadge
                    categoryId={expense.category_id ?? 'otros'}
                    size="md"
                    tone="soft"
                  />
                  <View style={styles.rowBody}>
                    <Text
                      style={[typography.bodyEmphasis, { color: theme.colors.text }]}
                      numberOfLines={1}
                    >
                      {expense.description || categoryName}
                    </Text>
                    <Text
                      style={[typography.caption, { color: theme.colors.textMuted }]}
                      numberOfLines={1}
                    >
                      {categoryName}
                    </Text>
                  </View>
                  <Text
                    style={[typography.bodyEmphasis, { color: theme.colors.text }]}
                    accessibilityLabel={`Monto: $${amount.toLocaleString('es-AR')}`}
                  >
                    -${amount.toLocaleString('es-AR')}
                  </Text>
                </View>
              </SwipeableRow>
            )
          })}
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 6,
    paddingBottom: 10,
  },
  listContainer: {
    borderRadius: radii.lg,
    overflow: 'hidden',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 1,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  rowBody: {
    flex: 1,
    gap: 2,
  },
})
