import { SectionList, StyleSheet } from 'react-native'
import { ExpenseHistoryRow } from '@/components/home/expense-history-row'
import { ExpenseHistorySectionHeader } from '@/components/home/expense-history-section-header'
import { type Category } from '@/features/categories/use-categories'
import { type ExpenseDaySection } from '@/features/expenses/expense-history'
import { type Expense } from '@/features/expenses/use-expenses'

interface ExpenseHistoryListProps {
  categoryById: Map<string, Category>
  groups: ExpenseDaySection[]
  selectedCategoryId: string
  onDelete: (expense: Expense) => void
  onEdit: (expense: Expense) => void
}

export function ExpenseHistoryList({
  categoryById,
  groups,
  selectedCategoryId,
  onDelete,
  onEdit,
}: ExpenseHistoryListProps) {
  return (
    <SectionList
      contentContainerStyle={styles.listContent}
      initialNumToRender={18}
      keyExtractor={(item) => item.id}
      maxToRenderPerBatch={12}
      removeClippedSubviews
      style={styles.list}
      renderItem={({ item }) => (
        <ExpenseHistoryRow
          category={categoryById.get(item.category_id) ?? null}
          expense={item}
          hideCategory={Boolean(selectedCategoryId)}
          onDelete={onDelete}
          onEdit={onEdit}
        />
      )}
      renderSectionHeader={({ section }) => <ExpenseHistorySectionHeader section={section} />}
      sections={groups}
      showsVerticalScrollIndicator={false}
      stickySectionHeadersEnabled={false}
      windowSize={8}
    />
  )
}

const styles = StyleSheet.create({
  list: {
    flex: 1,
    minHeight: 0,
  },
  listContent: {
    gap: 16,
    paddingBottom: 4,
  },
})
