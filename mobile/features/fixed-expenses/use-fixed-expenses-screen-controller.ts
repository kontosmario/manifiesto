import { useMemo, useState } from 'react'
import { Alert } from 'react-native'
import { type Category, useCategories } from '@/features/categories/use-categories'
import { type DerivedFixedExpense } from '@/features/fixed-expenses/commitment-utils'
import { useFixedExpenseEditorForm } from '@/features/fixed-expenses/use-fixed-expense-editor-form'
import { type FixedExpense } from '@/features/fixed-expenses/fixed-expense-types'
import {
  buildFixedExpensesSections,
  type FixedExpensesSectionKey,
} from '@/features/fixed-expenses/fixed-expenses-screen-model'
import {
  useDeleteFixedExpense,
  useFixedExpenses,
  useRecordFixedExpensePayment,
  useUpdateFixedExpense,
  useUpdateFixedExpenseStatus,
} from '@/features/fixed-expenses/use-fixed-expenses'
import { useFamilyDashboard } from '@/hooks/use-family-dashboard'
import { getErrorMessage } from '@/utils/error-message'

const EMPTY_CATEGORIES: Category[] = []

export function useFixedExpensesScreenController(familyId: string) {
  const dashboard = useFamilyDashboard(familyId)
  const fixedExpensesQuery = useFixedExpenses(familyId)
  const categoriesQuery = useCategories(familyId)
  const categories = categoriesQuery.data ?? EMPTY_CATEGORIES

  const updateFixedExpenseMutation = useUpdateFixedExpense(familyId)
  const updateFixedExpenseStatusMutation = useUpdateFixedExpenseStatus(familyId)
  const recordFixedExpensePaymentMutation = useRecordFixedExpensePayment(familyId)
  const deleteFixedExpenseMutation = useDeleteFixedExpense(familyId)

  const [editingFixedExpense, setEditingFixedExpense] = useState<FixedExpense | null>(null)
  const [activeSection, setActiveSection] = useState<FixedExpensesSectionKey>('upcoming')
  const fixedExpenseEditorForm = useFixedExpenseEditorForm({
    categories,
  })
  const {
    isAmountFocused,
    isRemainingBalanceFocused,
    submitState,
    values,
    actions: fixedExpenseEditorActions,
  } = fixedExpenseEditorForm

  const isBusy =
    updateFixedExpenseMutation.isPending ||
    updateFixedExpenseStatusMutation.isPending ||
    recordFixedExpensePaymentMutation.isPending ||
    deleteFixedExpenseMutation.isPending

  const categoryNameById = useMemo(
    () => new Map(categories.map((category) => [category.id, category.name] as const)),
    [categories],
  )
  const commitmentSummary = dashboard.currentCycleCommitmentSummary
  const attentionCount = commitmentSummary.overdueCount + commitmentSummary.dueSoonCount
  const sections = useMemo(() => buildFixedExpensesSections(commitmentSummary), [commitmentSummary])
  const activeSectionConfig =
    sections.find((section) => section.key === activeSection) ?? sections[0]!

  const showError = (error: unknown, fallbackMessage: string) => {
    Alert.alert('Algo salió mal', getErrorMessage(error, fallbackMessage))
  }

  const handleEditorSubmit = async () => {
    if (!submitState.payload || !editingFixedExpense) {
      return
    }

    await updateFixedExpenseMutation.mutateAsync(
      {
        ...submitState.payload,
        fixedExpenseId: editingFixedExpense.id,
      },
      {
        onError: (error: unknown) => {
          showError(error, 'No se pudo actualizar el gasto fijo.')
        },
        onSuccess: () => {
          setEditingFixedExpense(null)
        },
      },
    )
  }

  const handleDelete = (item: DerivedFixedExpense) => {
    Alert.alert('Borrar gasto fijo', 'Esta acción no se puede deshacer.', [
      { style: 'cancel', text: 'Cancelar' },
      {
        style: 'destructive',
        text: 'Borrar',
        onPress: () => {
          deleteFixedExpenseMutation.mutate(item.id, {
            onError: (error: unknown) => {
              showError(error, 'No se pudo borrar el gasto fijo.')
            },
          })
        },
      },
    ])
  }

  const handleRegisterPayment = (fixedExpenseId: string) => {
    recordFixedExpensePaymentMutation.mutate(fixedExpenseId, {
      onError: (error: unknown) => {
        showError(error, 'No se pudo registrar el pago.')
      },
    })
  }

  const handleToggleStatus = (item: DerivedFixedExpense) => {
    updateFixedExpenseStatusMutation.mutate(
      {
        fixedExpenseId: item.id,
        status: item.status === 'paused' ? 'active' : 'paused',
      },
      {
        onError: (error: unknown) => {
          showError(error, 'No se pudo actualizar el estado.')
        },
      },
    )
  }

  return {
    activeSectionConfig,
    attentionCount,
    categories,
    categoriesQuery,
    dashboard,
    editor: {
      canSubmit: submitState.canSubmit,
      categories,
      isAmountFocused,
      isRemainingBalanceFocused,
      onAmountFocusChange: fixedExpenseEditorActions.setAmountFocused,
      onClose: () => setEditingFixedExpense(null),
      onFieldChange: fixedExpenseEditorActions.setField,
      onRemainingBalanceFocusChange: fixedExpenseEditorActions.setRemainingBalanceFocused,
      onSubmit: handleEditorSubmit,
      showStatusSection: Boolean(editingFixedExpense),
      submitLabel: 'Actualizar gasto fijo',
      title: 'Editar gasto fijo',
      values,
      visible: Boolean(editingFixedExpense),
    },
    categoryNameById,
    commitmentSummary,
    editingFixedExpense,
    fixedExpensesQuery,
    isBusy,
    sections,
    actions: {
      closeEditModal: () => setEditingFixedExpense(null),
      deleteItem: handleDelete,
      openEditModal: (item: FixedExpense | DerivedFixedExpense) => {
        fixedExpenseEditorActions.reset({
          categories,
          fixedExpense: item,
        })
        setEditingFixedExpense(item)
      },
      registerPayment: handleRegisterPayment,
      setActiveSection,
      toggleStatus: handleToggleStatus,
    },
  }
}
