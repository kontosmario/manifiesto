import { StyleSheet, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { ExpenseHistoryList } from '@/components/home/expense-history-list'
import { AppButton } from '@/components/ui/button'
import { BrandedPanel } from '@/components/ui/branded-panel'
import { EmptyState } from '@/components/ui/empty-state'
import { LoadingBlock } from '@/components/ui/loading-block'
import { SectionHeader } from '@/components/ui/section-header'
import type { Category } from '@/features/categories/use-categories'
import type { ExpenseDaySection } from '@/features/expenses/expense-history'
import type { Expense } from '@/features/expenses/use-expenses'

interface ExpenseHistoryContentCardProps {
  categoryById: Map<string, Category>
  expensesCount: number
  filteredExpensesCount: number
  groups: ExpenseDaySection[]
  isLoading: boolean
  selectedCategoryId: string
  onClearFilters: () => void
  onDeleteExpense: (expense: Expense) => void
  onEditExpense: (expense: Expense) => void
}

export function ExpenseHistoryContentCard({
  categoryById,
  expensesCount,
  filteredExpensesCount,
  groups,
  isLoading,
  selectedCategoryId,
  onClearFilters,
  onDeleteExpense,
  onEditExpense,
}: ExpenseHistoryContentCardProps) {
  const { t } = useTranslation()
  return (
    <BrandedPanel style={[styles.historyCard, styles.historyCardFlex]}>
      <SectionHeader
        subtitle={t('home:historyContent.subtitle')}
        title={t('home:historyContent.title')}
      />

      {isLoading ? <LoadingBlock label={t('home:historyContent.loading')} /> : null}

      {!isLoading && expensesCount === 0 ? (
        <EmptyState
          icon="receipt-long"
          subtitle={t('home:historyContent.emptySubtitle')}
          title={t('home:historyContent.emptyTitle')}
        />
      ) : null}

      {!isLoading && expensesCount > 0 && filteredExpensesCount === 0 ? (
        <View style={styles.emptyFilteredState}>
          <EmptyState
            icon="filter-alt"
            subtitle={t('home:historyContent.noResultsSubtitle')}
            title={t('home:historyContent.noResultsTitle')}
          />
          <AppButton
            fullWidth={false}
            label={t('home:historyContent.clearFilters')}
            onPress={onClearFilters}
            size="compact"
            variant="ghost"
          />
        </View>
      ) : null}

      {!isLoading && expensesCount > 0 && filteredExpensesCount > 0 ? (
        <ExpenseHistoryList
          categoryById={categoryById}
          groups={groups}
          selectedCategoryId={selectedCategoryId}
          onDelete={onDeleteExpense}
          onEdit={onEditExpense}
        />
      ) : null}
    </BrandedPanel>
  )
}

const styles = StyleSheet.create({
  historyCard: {
    gap: 14,
    paddingHorizontal: 18,
    paddingVertical: 16,
  },
  historyCardFlex: {
    flex: 1,
    minHeight: 0,
  },
  emptyFilteredState: {
    gap: 12,
    alignItems: 'flex-start',
  },
})
