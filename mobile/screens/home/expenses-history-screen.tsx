import { StyleSheet, View } from 'react-native'
import { useRouter } from 'expo-router'
import { ExpenseEditorModal } from '@/components/home/expense-editor-modal'
import { ExpenseHistoryContentCard } from '@/components/home/expense-history-content-card'
import { ExpenseHistoryHeroCard } from '@/components/home/expense-history-hero-card'
import { ExpenseHistoryToolbar } from '@/components/home/expense-history-toolbar'
import { AmbientBackdrop } from '@/components/ui/ambient-backdrop'
import { ErrorState } from '@/components/ui/error-state'
import { Screen } from '@/components/ui/screen'
import { useExpenseHistoryController } from '@/features/expenses/use-expense-history-controller'
import { buildScreenHeaderPalette } from '@/theme/screen-header'
import { useAppTheme } from '@/theme/theme-provider'
import { getErrorMessage } from '@/utils/error-message'

interface ExpensesHistoryScreenProps {
  familyId: string
  title?: string
  subtitle?: string
  canGoBack?: boolean
}

export function ExpensesHistoryScreen({
  familyId,
  title = 'Historial',
  subtitle,
  canGoBack = false,
}: ExpensesHistoryScreenProps) {
  const router = useRouter()
  const { theme } = useAppTheme()
  const controller = useExpenseHistoryController(familyId, theme)
  const {
    categoryById,
    editingExpense,
    expenses,
    expensesQuery,
    filtersAreDirty,
    heroSubtitle,
    isBusy,
    snapshot,
    actions,
    categoriesQuery,
    dashboard,
    selectedCategoryId,
  } = controller
  const headerPalette = buildScreenHeaderPalette(theme)
  const screenError =
    expensesQuery.error ??
    categoriesQuery.error ??
    dashboard.familyFinanceQuery.error ??
    dashboard.expensesQuery.error
  const shouldShowErrorState = Boolean(
    (expensesQuery.error && !expensesQuery.data) ||
      (categoriesQuery.error && !categoriesQuery.data) ||
      (dashboard.familyFinanceQuery.error && !dashboard.familyFinanceQuery.data),
  )

  return (
    <>
      <Screen
        bodyStyle={styles.screenBody}
        canGoBack={canGoBack}
        contentContainerStyle={styles.screenContent}
        rightSlot={
          <ExpenseHistoryToolbar
            buttonBackgroundColor={headerPalette.buttonBackgroundColor}
            buttonBorderColor={headerPalette.buttonBorderColor}
            filtersAreDirty={filtersAreDirty}
            iconColor={headerPalette.iconColor}
            onOpenCategories={() => router.push('/(app)/expense-categories')}
            onOpenFilters={() => router.push('/(app)/expense-filters')}
          />
        }
        scrollable={false}
        subtitle={subtitle}
        title={title}
        titleColor={headerPalette.titleColor}
      >
        <View style={styles.sectionStack}>
          {!theme.isDark ? (
            <AmbientBackdrop variant="history" />
          ) : null}

          {shouldShowErrorState ? (
            <ErrorState
              description={getErrorMessage(
                screenError,
                'No pudimos cargar el historial y sus filtros.',
              )}
              title="No pudimos cargar el historial"
              onAction={() => {
                void Promise.all([
                  expensesQuery.refetch(),
                  categoriesQuery.refetch(),
                  dashboard.refetchAll(),
                ])
              }}
            />
          ) : (
            <>
              <ExpenseHistoryHeroCard
                filteredTotal={snapshot.filteredTotal}
                heroSubtitle={heroSubtitle}
                rows={snapshot.breakdown.rows}
                title={snapshot.breakdown.title}
              />

              <ExpenseHistoryContentCard
                categoryById={categoryById}
                expensesCount={expenses.length}
                filteredExpensesCount={snapshot.filteredExpenses.length}
                groups={snapshot.groups}
                isLoading={expensesQuery.isLoading}
                selectedCategoryId={selectedCategoryId}
                onClearFilters={actions.clearFilters}
                onDeleteExpense={actions.deleteExpense}
                onEditExpense={actions.openEditExpense}
              />
            </>
          )}
        </View>
      </Screen>

      {editingExpense ? (
        <ExpenseEditorModal
          key={`expense-editor-${editingExpense.id}`}
          expense={editingExpense}
          isBusy={isBusy}
          onClose={actions.closeExpenseEditor}
          onSubmit={actions.submitExpenseUpdate}
          submitLabel="Actualizar"
          title="Editar gasto"
          visible
        />
      ) : null}
    </>
  )
}

const styles = StyleSheet.create({
  screenContent: {
    paddingTop: 4,
  },
  screenBody: {
    flex: 1,
  },
  sectionStack: {
    flex: 1,
    gap: 18,
    position: 'relative',
  },
})
