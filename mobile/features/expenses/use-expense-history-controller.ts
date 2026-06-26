import { useMemo, useState } from 'react'
import { Alert } from 'react-native'
import {
  type Category,
  useCategories,
} from '@/features/categories/use-categories'
import {
  buildExpenseHistorySnapshot,
  resolveSelectedCategoryId,
} from '@/features/expenses/expense-history'
import { useExpenseHistoryFilters } from '@/features/expenses/expense-history-filters.store'
import {
  type Expense,
  useDeleteExpense,
  useExpenses,
  useUpdateExpense,
} from '@/features/expenses/use-expenses'
import { useFamilyDashboard } from '@/hooks/use-family-dashboard'
import i18n from '@/lib/i18n'
import type { AppTheme } from '@/theme/palette'
import { getErrorMessage } from '@/utils/error-message'

const EMPTY_CATEGORIES: Category[] = []
const EMPTY_EXPENSES: Expense[] = []

export function useExpenseHistoryController(familyId: string, theme: AppTheme) {
  const dashboard = useFamilyDashboard(familyId)
  const categoriesQuery = useCategories(familyId)
  const categories = categoriesQuery.data ?? EMPTY_CATEGORIES
  const {
    categorySelection,
    clearFilters,
    periodFilter,
    searchQuery,
  } = useExpenseHistoryFilters(familyId)
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null)

  const selectedCategoryId = useMemo(
    () => resolveSelectedCategoryId(categories, categorySelection),
    [categories, categorySelection],
  )
  const categoryById = useMemo(
    () => new Map(categories.map((category) => [category.id, category] as const)),
    [categories],
  )
  const filtersAreDirty =
    periodFilter !== 'cycle' ||
    Boolean(selectedCategoryId) ||
    searchQuery.trim().length > 0
  const expensesQuery = useExpenses(familyId, selectedCategoryId || undefined)
  // Expense history shows only MANUAL gastos. Commitment payments
  // (fijos auto-marked as paid) live exclusively on the Fijos screen
  // — surfacing them in the gastos history would mix two semantically
  // different streams and break the search/filter UX.
  const expenses = useMemo(
    () => (expensesQuery.data ?? EMPTY_EXPENSES).filter((e) => !e.commitment_id),
    [expensesQuery.data],
  )
  const updateExpenseMutation = useUpdateExpense(familyId)
  const deleteExpenseMutation = useDeleteExpense(familyId)
  const normalizedSearch = searchQuery.trim().toLowerCase()
  const isBusy = updateExpenseMutation.isPending || deleteExpenseMutation.isPending

  const snapshot = useMemo(
    () =>
      buildExpenseHistorySnapshot({
        categoryById,
        cycleEnd: dashboard.payCycle.end,
        cycleStart: dashboard.payCycle.start,
        expenses,
        normalizedSearch,
        periodFilter,
        primaryColor: theme.colors.primary,
        searchQuery,
        selectedCategoryId,
        successColor: theme.colors.success,
        today: dashboard.todayDate,
        warningColor: theme.colors.warning,
      }),
    [
      categoryById,
      dashboard.payCycle.end,
      dashboard.payCycle.start,
      dashboard.todayDate,
      expenses,
      normalizedSearch,
      periodFilter,
      searchQuery,
      selectedCategoryId,
      theme.colors.primary,
      theme.colors.success,
      theme.colors.warning,
    ],
  )

  const heroSubtitle = expensesQuery.isLoading ? i18n.t('gastos:history.loadingMovements') : snapshot.heroSubtitle

  const handleError = (error: unknown, fallbackMessage: string) => {
    Alert.alert(i18n.t('gastos:errors.somethingWrongNoAccent'), getErrorMessage(error, fallbackMessage))
  }

  const handleDeleteExpense = (expense: Expense) => {
    Alert.alert(i18n.t('gastos:history.deleteTitle'), i18n.t('gastos:history.deleteMessage'), [
      { style: 'cancel', text: i18n.t('common:actions.cancel') },
      {
        style: 'destructive',
        text: i18n.t('gastos:history.deleteConfirm'),
        onPress: () => {
          deleteExpenseMutation.mutate(expense.id, {
            onError: (error: unknown) => {
              handleError(error, i18n.t('gastos:errors.deleteFailed'))
            },
          })
        },
      },
    ])
  }

  return {
    categories,
    categoriesQuery,
    dashboard,
    categoryById,
    editingExpense,
    expenses,
    expensesQuery,
    filtersAreDirty,
    heroSubtitle,
    isBusy,
    periodFilter,
    searchQuery,
    selectedCategoryId,
    snapshot,
    actions: {
      clearFilters,
      closeExpenseEditor: () => setEditingExpense(null),
      deleteExpense: handleDeleteExpense,
      openEditExpense: setEditingExpense,
      submitExpenseUpdate: async (payload: { description: string; price: number }) => {
        if (!editingExpense) {
          return
        }

        await updateExpenseMutation.mutateAsync(
          {
            description: payload.description,
            expenseId: editingExpense.id,
            price: payload.price,
          },
          {
            onError: (error: unknown) => {
              handleError(error, i18n.t('gastos:errors.updateFailed'))
            },
            onSuccess: () => {
              setEditingExpense(null)
            },
          },
        )
      },
    },
  }
}
