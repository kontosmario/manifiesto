import { StyleSheet, Text, View, Pressable } from 'react-native'
import { EmptyState } from '@/components/ui/empty-state'
import { ErrorState } from '@/components/ui/error-state'
import { ListRowSkeleton } from '@/components/ui/skeleton-layouts'
import { SwipeableRow, type SwipeAction } from '@/components/ui/swipeable-row'
import { ActivityRowV2 } from '@/components/home/activity-row-v2'
import { errorMessages } from '@/lib/copy/states'
import { type DashboardErrorKind } from '@/features/home/home-dashboard-model'
import type { Expense } from '@/features/expenses/use-expenses'
import { radii } from '@/theme/palette'
import { typography } from '@/theme/typography'
import { useAppTheme } from '@/theme/theme-provider'

interface HomeActivitySectionProps {
  expenses: Expense[]
  categoryNameById: Map<string, string>
  familyMembers?: Array<{ id: string; name: string; color: string }>
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
  familyMembers = [],
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
        <View style={styles.listContainer}>
          {expenses.map((expense, index) => {
            const categoryName = categoryNameById.get(expense.category_id) ?? 'Sin categoría'
            const dangerAction: SwipeAction = {
              label: 'Eliminar',
              tone: 'danger',
              onPress: () => onDelete(expense.id),
            }
            return (
              <SwipeableRow
                key={expense.id}
                accessibilityHint="Desliza hacia la izquierda para eliminar"
                rightActions={[dangerAction]}
              >
                <ActivityRowV2
                  icon={pickIconForCategory(categoryName)}
                  title={expense.description || categoryName}
                  category={categoryName}
                  whoName={findName(familyMembers, expense.created_by) ?? 'Alguien'}
                  whoColor={findColor(familyMembers, expense.created_by) ?? '#2E7D5B'}
                  amount={-Math.round(Math.abs(Number(expense.price ?? 0)))}
                  delay={400 + index * 60}
                />
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
  },
})

function pickIconForCategory(name: string): string {
  const n = name.toLowerCase()
  if (/super|alma|comida/.test(n)) return '🛒'
  if (/transporte|sube|combustible|auto/.test(n)) return '🚌'
  if (/ocio|salid|fernet/.test(n)) return '🍹'
  if (/casa|alquil|servic/.test(n)) return '🏠'
  if (/salud|farm/.test(n)) return '💊'
  if (/cuid|personal/.test(n)) return '🧴'
  return '📁'
}

function findName(
  members: Array<{ id: string; name: string; color: string }>,
  userId: string,
): string | undefined {
  return members.find((m) => m.id === userId)?.name
}

function findColor(
  members: Array<{ id: string; name: string; color: string }>,
  userId: string,
): string | undefined {
  return members.find((m) => m.id === userId)?.color
}
