import { Alert } from 'react-native'
import { type Category, useCategories } from '@/features/categories/use-categories'
import { useFixedExpenseEditorForm } from '@/features/fixed-expenses/use-fixed-expense-editor-form'
import {
  getFixedExpenseAddConfig,
  resolveFixedExpensesSectionKey,
} from '@/features/fixed-expenses/fixed-expenses-screen-model'
import { useCreateFixedExpense } from '@/features/fixed-expenses/use-fixed-expenses'
import { getErrorMessage } from '@/utils/error-message'

const EMPTY_CATEGORIES: Category[] = []

interface UseAddFixedExpenseControllerParams {
  familyId: string
  initialSection?: string | null
  onCreated: () => void
}

export function useAddFixedExpenseController({
  familyId,
  initialSection,
  onCreated,
}: UseAddFixedExpenseControllerParams) {
  const sectionKey = resolveFixedExpensesSectionKey(initialSection)
  const sectionConfig = getFixedExpenseAddConfig(sectionKey)
  const categoriesQuery = useCategories(familyId)
  const categories = categoriesQuery.data ?? EMPTY_CATEGORIES
  const createFixedExpenseMutation = useCreateFixedExpense(familyId)
  const fixedExpenseEditorForm = useFixedExpenseEditorForm({
    categories,
    defaultKind: sectionConfig.defaultKind,
  })
  const {
    isAmountFocused,
    isRemainingBalanceFocused,
    submitState,
    values,
    actions,
  } = fixedExpenseEditorForm

  const showError = (error: unknown, fallbackMessage: string) => {
    Alert.alert('Algo salió mal', getErrorMessage(error, fallbackMessage))
  }

  const submit = async () => {
    if (!submitState.payload) {
      return
    }

    await createFixedExpenseMutation.mutateAsync(submitState.payload, {
      onError: (error: unknown) => {
        showError(error, 'No se pudo crear el gasto fijo.')
      },
      onSuccess: () => {
        onCreated()
      },
    })
  }

  return {
    categories,
    categoriesQuery,
    isBusy: createFixedExpenseMutation.isPending,
    isAmountFocused,
    isRemainingBalanceFocused,
    sectionConfig,
    submit,
    values,
    actions: {
      onAmountFocusChange: actions.setAmountFocused,
      onFieldChange: actions.setField,
      onRemainingBalanceFocusChange: actions.setRemainingBalanceFocused,
    },
    submitState,
  }
}
