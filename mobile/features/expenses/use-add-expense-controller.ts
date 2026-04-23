import { useMemo, useState } from 'react'
import { Alert } from 'react-native'
import {
  type CategoryTemplate,
  useCategoryTemplates,
} from '@/features/categories/use-category-templates'
import { type Category, useCategories } from '@/features/categories/use-categories'
import { type Expense, useCreateExpense, useExpenses } from '@/features/expenses/use-expenses'
import { rankCategoriesByUsage, pickTopCategoryDescriptions } from '@/features/home/add-expense-model'
import { useFamilyDashboard } from '@/hooks/use-family-dashboard'
import { triggerHaptic } from '@/lib/haptics'
import { getErrorMessage } from '@/utils/error-message'
import { parsePrice } from '@/utils/money'

const EMPTY_CATEGORIES: Category[] = []
const EMPTY_CATEGORY_TEMPLATES: CategoryTemplate[] = []
const EMPTY_EXPENSES: Expense[] = []
const MAX_QUICK_DESCRIPTION_SUGGESTIONS = 6

function normalizeSuggestionLabel(value: string) {
  return value
    .trim()
    .toLocaleLowerCase('es-AR')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
}

interface UseAddExpenseControllerParams {
  familyId: string
  onCreated: () => void
  userId: string
}

export function useAddExpenseController({
  familyId,
  onCreated,
  userId,
}: UseAddExpenseControllerParams) {
  const dashboard = useFamilyDashboard(familyId)
  const categoriesQuery = useCategories(familyId)
  const categoryTemplatesQuery = useCategoryTemplates()
  const expensesQuery = useExpenses(familyId)
  const createExpenseMutation = useCreateExpense(familyId, userId)
  const categories = categoriesQuery.data ?? EMPTY_CATEGORIES
  const categoryTemplates = categoryTemplatesQuery.data ?? EMPTY_CATEGORY_TEMPLATES
  const expenses = expensesQuery.data ?? EMPTY_EXPENSES
  const [categorySelection, setCategorySelection] = useState('')
  const [description, setDescription] = useState('')
  const [rawPrice, setRawPrice] = useState('')
  const [isNumpadVisible, setNumpadVisible] = useState(true)

  const selectedCategoryId = useMemo(() => {
    if (categories.length === 0) return ''
    return categories.some((c) => c.id === categorySelection)
      ? categorySelection
      : categories[0].id
  }, [categories, categorySelection])

  const selectedCategory = categories.find((c) => c.id === selectedCategoryId) ?? null

  const parsedAmount = parsePrice(rawPrice)
  const hasValidAmount = Number.isFinite(parsedAmount) && parsedAmount > 0
  const amount = hasValidAmount ? parsedAmount : 0

  const quickDescriptionSuggestions = useMemo(() => {
    if (!selectedCategory) return []
    const templateDescriptions =
      categoryTemplates.find((t) => t.id === selectedCategory.template_id)?.quickDescriptions ??
      categoryTemplates.find((t) => t.name === selectedCategory.name)?.quickDescriptions ??
      []
    const fromHistory = pickTopCategoryDescriptions(expenses, selectedCategory.id, 6)
    const merged = [...fromHistory, ...templateDescriptions]
    const seen = new Set<string>()
    return merged
      .filter((s) => {
        const normalized = normalizeSuggestionLabel(s)
        if (!normalized || seen.has(normalized)) return false
        seen.add(normalized)
        return true
      })
      .slice(0, MAX_QUICK_DESCRIPTION_SUGGESTIONS)
  }, [categoryTemplates, expenses, selectedCategory])

  const suggestedAmounts = useMemo(() => {
    const baseAmount =
      dashboard.monthlyIncome > 0
        ? Math.max(1500, Math.round((dashboard.monthlyIncome * 0.01) / 500) * 500)
        : 5000
    const amounts = [baseAmount, baseAmount * 2, baseAmount * 3, baseAmount * 5]
    return [...new Set(amounts.map((v) => Math.max(1000, Math.round(v / 500) * 500)))]
  }, [dashboard.monthlyIncome])

  const rankedCategories = useMemo(
    () => rankCategoriesByUsage(expenses, categories),
    [expenses, categories],
  )

  const showError = (error: unknown, fallback: string) => {
    void triggerHaptic('error')
    Alert.alert('Algo salió mal', getErrorMessage(error, fallback))
  }

  const submitExpense = () => {
    if (!selectedCategoryId || !hasValidAmount) return
    createExpenseMutation.mutate(
      {
        categoryId: selectedCategoryId,
        description: description.trim(),
        price: amount,
      },
      {
        onError: (error: unknown) => {
          showError(error, 'No se pudo crear el gasto.')
        },
        onSuccess: () => {
          void triggerHaptic('success')
          setDescription('')
          setRawPrice('')
          onCreated()
        },
      },
    )
  }

  return {
    amount,
    categories,
    rankedCategories,
    categoriesQuery,
    createExpenseMutation,
    dashboard,
    description,
    expensesQuery,
    hasValidAmount,
    isNumpadVisible,
    normalizeSuggestionLabel,
    rawPrice,
    quickDescriptionSuggestions,
    selectedCategoryId,
    submitExpense,
    suggestedAmounts,
    actions: {
      selectCategory: setCategorySelection,
      setDescription,
      setRawPrice,
      setNumpadVisible,
      setSuggestedAmount: (value: number) => setRawPrice(String(Math.round(value))),
      useQuickDescription: setDescription,
    },
  }
}
