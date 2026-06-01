import { memo } from 'react'
import { StyleSheet } from 'react-native'
import Swipeable from 'react-native-gesture-handler/ReanimatedSwipeable'
import { ExpenseHistoryRowActions } from '@/components/home/expense-history-row-actions'
import { ExpenseHistoryRowCard } from '@/components/home/expense-history-row-card'
import type { Category } from '@/features/categories/use-categories'
import type { Expense } from '@/features/expenses/use-expenses'
import { triggerHaptic } from '@/lib/haptics'
import { withAlpha } from '@/theme/color-utils'
import { useThemeTokens } from '@/theme/theme-provider'

export const ExpenseHistoryRow = memo(function ExpenseHistoryRow({
  category,
  expense,
  hideCategory,
  onDelete,
  onEdit,
}: {
  category: Category | null
  expense: Expense
  hideCategory: boolean
  onDelete: (expense: Expense) => void
  onEdit: (expense: Expense) => void
}) {
  const theme = useThemeTokens()
  const rowPalette = theme.isDark
    ? {
        backgroundColor: theme.colors.surfaceMuted,
        borderColor: theme.colors.border,
        pillBackgroundColor: theme.colors.surface,
      }
    : {
        backgroundColor: withAlpha(theme.colors.backgroundElevated, 0.98),
        borderColor: withAlpha(theme.colors.text, 0.08),
        pillBackgroundColor: withAlpha(theme.colors.backgroundElevated, 0.95),
      }

  return (
    <Swipeable
      containerStyle={styles.rowSwipeWrap}
      friction={2}
      overshootRight={false}
      renderRightActions={(_progress, _dragX, swipeable) => (
        <ExpenseHistoryRowActions
          onDelete={() => {
            swipeable.close()
            onDelete(expense)
          }}
          onEdit={() => {
            swipeable.close()
            onEdit(expense)
          }}
        />
      )}
      rightThreshold={30}
      onSwipeableWillOpen={() => {
        void triggerHaptic('selection')
      }}
    >
      <ExpenseHistoryRowCard
        category={category}
        expense={expense}
        hideCategory={hideCategory}
        palette={rowPalette}
        onPress={() => {
          void triggerHaptic('selection')
          onEdit(expense)
        }}
      />
    </Swipeable>
  )
})

const styles = StyleSheet.create({
  rowSwipeWrap: {
    marginTop: 10,
  },
})
