import { StyleSheet, View } from 'react-native'
import { EmptyState } from '@/components/ui/empty-state'
import { ErrorState } from '@/components/ui/error-state'
import { ListRowSkeleton } from '@/components/ui/skeleton-layouts'
import { SwipeableRow, type SwipeAction } from '@/components/ui/swipeable-row'
import { ActivityRowV2 } from '@/components/home/activity-row-v2'
import { errorMessages } from '@/lib/copy/states'
import { type DashboardErrorKind } from '@/features/home/home-dashboard-model'
import type { Expense } from '@/features/expenses/use-expenses'

interface HomeActivitySectionProps {
  expenses: Expense[]
  categoryNameById: Map<string, string>
  familyMembers?: Array<{ id: string; name: string; color: string }>
  isLoading: boolean
  errorKind?: DashboardErrorKind
  onDelete: (expenseId: string) => void
  onRetry: () => void
  onAddFirst: () => void
}

/**
 * Renders the body of the Home activity section — list of ActivityRowV2
 * cards, or the empty / error / loading state. The section header
 * ("ACTIVIDAD" + "Ver todos") is owned by HomeDashboard so the layout
 * stays consistent with the V1 Cuaderno mock.
 */
export function HomeActivitySection({
  expenses,
  categoryNameById,
  familyMembers = [],
  isLoading,
  errorKind,
  onDelete,
  onRetry,
  onAddFirst,
}: HomeActivitySectionProps) {
  if (isLoading) {
    return (
      <View style={styles.skeleton}>
        <ListRowSkeleton rows={3} />
      </View>
    )
  }
  if (errorKind) {
    return (
      <ErrorState
        description={errorKind === 'network' ? errorMessages.network : errorMessages.server}
        onAction={onRetry}
      />
    )
  }
  if (expenses.length === 0) {
    return (
      <EmptyState
        icon="receipt-long"
        stateKey="expensesThisCycle"
        action={{ label: 'Registrar primer gasto', onPress: onAddFirst }}
      />
    )
  }

  return (
    <View style={styles.list}>
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
  )
}

const styles = StyleSheet.create({
  list: { gap: 6 },
  skeleton: { gap: 6 },
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
