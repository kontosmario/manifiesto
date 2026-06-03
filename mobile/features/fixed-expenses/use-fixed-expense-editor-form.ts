import { useMemo, useState } from 'react'
import type { Category } from '@/features/categories/use-categories'
import {
  buildFixedExpenseEditorInitialValues,
  buildFixedExpenseSubmitState,
  type FixedExpenseEditorValues,
} from '@/features/fixed-expenses/fixed-expense-editor-model'
import type { FixedExpense, FixedExpenseKind } from '@/features/fixed-expenses/fixed-expense-types'

export function useFixedExpenseEditorForm({
  categories,
  defaultKind,
  fixedExpense,
}: {
  categories: Category[]
  defaultKind?: FixedExpenseKind
  fixedExpense?: FixedExpense | null
}) {
  const [values, setValues] = useState<FixedExpenseEditorValues>(() =>
    buildFixedExpenseEditorInitialValues({
      categories,
      defaultKind,
      fixedExpense,
    }),
  )
  const [isAmountFocused, setAmountFocused] = useState(false)
  const [isRemainingBalanceFocused, setRemainingBalanceFocused] = useState(false)

  // No one-shot "seed categoryId to categories[0]" effect. Same stance
  // as the rest of the add-* forms: the user explicitly picks. The
  // empty initial value is what surfaces "categoría" in the submit
  // state's missing-fields list.

  const submitState = useMemo(() => buildFixedExpenseSubmitState(values), [values])

  return {
    isAmountFocused,
    isRemainingBalanceFocused,
    submitState,
    values,
    actions: {
      setAmountFocused,
      setRemainingBalanceFocused,
      setField<K extends keyof FixedExpenseEditorValues>(
        key: K,
        value: FixedExpenseEditorValues[K],
      ) {
        setValues((current) => ({
          ...current,
          [key]: value,
        }))
      },
      reset({
        categories: nextCategories = categories,
        defaultKind: nextDefaultKind = defaultKind,
        fixedExpense: nextFixedExpense = fixedExpense,
      }: {
        categories?: Pick<Category, 'id'>[]
        defaultKind?: FixedExpenseKind
        fixedExpense?: FixedExpense | null
      } = {}) {
        setValues(
          buildFixedExpenseEditorInitialValues({
            categories: nextCategories,
            defaultKind: nextDefaultKind,
            fixedExpense: nextFixedExpense,
          }),
        )
        setAmountFocused(false)
        setRemainingBalanceFocused(false)
      },
    },
  }
}
