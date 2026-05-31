import { SectionList, StyleSheet } from 'react-native'
import { ScrollView as GHScrollView } from 'react-native-gesture-handler'
import Animated, { FadeIn, ReduceMotion } from 'react-native-reanimated'
import { ExpenseHistoryRow } from '@/components/home/expense-history-row'
import { ExpenseHistorySectionHeader } from '@/components/home/expense-history-section-header'
import { type Category } from '@/features/categories/use-categories'
import { type ExpenseDaySection } from '@/features/expenses/expense-history'
import { type Expense } from '@/features/expenses/use-expenses'
import { motionDurations, motionStagger } from '@/lib/motion'

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
      removeClippedSubviews={true}
      renderScrollComponent={(props) => <GHScrollView {...props} />}
      style={styles.list}
      renderItem={({ item, index }) => {
        // The stagger only applies to the first 8 rows so a long
        // history doesn't paint slowly. Past index 8 we skip the
        // Animated.View wrapper entirely — Reanimated still
        // instantiates entering worklets on `undefined`, so omitting
        // the wrapper is what actually frees the cost.
        const ROW_STAGGER_CAP = 8
        const staggerDelay = Math.min(index, ROW_STAGGER_CAP) * motionStagger.listItem
        const row = (
          <ExpenseHistoryRow
            category={categoryById.get(item.category_id) ?? null}
            expense={item}
            hideCategory={Boolean(selectedCategoryId)}
            onDelete={onDelete}
            onEdit={onEdit}
          />
        )
        if (index >= ROW_STAGGER_CAP) {
          return row
        }
        return (
          <Animated.View
            entering={FadeIn.delay(staggerDelay)
              .duration(motionDurations.enterTab)
              .reduceMotion(ReduceMotion.System)}
          >
            {row}
          </Animated.View>
        )
      }}
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
