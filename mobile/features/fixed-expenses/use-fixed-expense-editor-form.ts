import { useEffect, useMemo, useState } from 'react'
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

  useEffect(() => {
    if (!values.categoryId && categories[0]?.id) {
      setValues((current) => {
        if (current.categoryId) {
          return current
        }

        return {
          ...current,
          categoryId: categories[0].id,
        }
      })
    }
  }, [categories, values.categoryId])

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
