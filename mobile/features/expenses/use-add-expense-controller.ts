import { useMemo, useState } from 'react'
import { Alert } from 'react-native'
import {
  type CategoryTemplate,
  useCategoryTemplates,
} from '@/features/categories/use-category-templates'
import { type Category, useCategories } from '@/features/categories/use-categories'
import { filterVariableExpenseCategories } from '@/features/expenses/variable-expense-categories'
import { type Expense, useCreateExpense, useExpenses } from '@/features/expenses/use-expenses'
import { rankCategoriesByUsage, pickTopCategoryDescriptions } from '@/features/expenses/category-ranking'
import { useFamilyDashboard } from '@/hooks/use-family-dashboard'
import { triggerHaptic } from '@/lib/haptics'
import i18n from '@/lib/i18n'
import { getErrorMessage } from '@/utils/error-message'
import { parsePrice, serializePrice } from '@/utils/money'

const EMPTY_CATEGORIES: Category[] = []
const EMPTY_CATEGORY_TEMPLATES: CategoryTemplate[] = []
const EMPTY_EXPENSES: Expense[] = []
const MAX_QUICK_DESCRIPTION_SUGGESTIONS = 6
const QUICK_AMOUNTS = [5000, 15000, 30000, 50000, 100000] as const

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
  /**
   * When set, the new expense is stamped with this date instead of
   * `now()`. Used by the Gastos calendar's "registrar gasto olvidado"
   * flow so a user can back-date a movement to a past day of the
   * cycle they forgot to log.
   */
  forDate?: Date | null
}

export function useAddExpenseController({
  familyId,
  onCreated,
  userId,
  forDate,
}: UseAddExpenseControllerParams) {
  const dashboard = useFamilyDashboard(familyId)
  const categoriesQuery = useCategories(familyId)
  const categoryTemplatesQuery = useCategoryTemplates()
  const expensesQuery = useExpenses(familyId)
  const createExpenseMutation = useCreateExpense(familyId, userId)
  // Hide the fixed-only categories (Alquiler, Servicios, Suscripciones)
  // from the variable-expense picker. The data layer keeps them at
  // scope='expense' so the fijos add flow can still surface the full
  // catalog; the filter is local to this controller.
  const categories = useMemo(
    () => filterVariableExpenseCategories(categoriesQuery.data ?? EMPTY_CATEGORIES),
    [categoriesQuery.data],
  )
  const categoryTemplates = categoryTemplatesQuery.data ?? EMPTY_CATEGORY_TEMPLATES
  // Suggestions and category ranking should only learn from MANUAL
  // gastos (the user's own typing patterns). Commitment payments are
  // auto-generated when a fijo is marked paid — they'd skew both the
  // descriptions and the most-used categories toward the fixed-bills
  // category nobody types into.
  const expenses = useMemo(
    () => (expensesQuery.data ?? EMPTY_EXPENSES).filter((e) => !e.commitment_id),
    [expensesQuery.data],
  )
  const [categorySelection, setCategorySelection] = useState('')
  const [description, setDescription] = useState('')
  // Notes: free-form optional context. Empty string when absent (we
  // never carry null in UI state to keep TextInput controlled). The
  // submit path passes it as-is and the repository normalizes via
  // `normalizeExpenseNotes` (empty → null, with-text → trim + cap).
  const [notes, setNotes] = useState('')
  const [rawPrice, setRawPrice] = useState('')
  const [isNumpadVisible, setNumpadVisible] = useState(true)
  // Increments each time the dashboard CTA is tapped while required
  // fields are missing. The dashboard reads this against its initial
  // value to flip into "flagged" mode and paint warning hues on the
  // specific unfilled inputs. Same pattern as the import-review wizard.
  const [highlightToken, setHighlightToken] = useState(0)

  // Stay null/empty until the user actually picks a category. The
  // earlier "fall back to categories[0].id" was silently nominating
  // the first item as the user's choice, which let them submit
  // miscategorized expenses without realizing — same data-integrity
  // hole we closed on the import-review wizard.
  const selectedCategoryId = useMemo(() => {
    if (categories.length === 0) return ''
    return categories.some((c) => c.id === categorySelection)
      ? categorySelection
      : ''
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

  const suggestedAmounts = useMemo(() => [...QUICK_AMOUNTS], [])

  const rankedCategories = useMemo(
    () => rankCategoriesByUsage(expenses, categories),
    [expenses, categories],
  )

  const showError = (error: unknown, fallback: string) => {
    void triggerHaptic('error')
    Alert.alert(i18n.t('gastos:errors.somethingWrong'), getErrorMessage(error, fallback))
  }

  // Human-readable list of required fields the user still has to
  // fill. `submitExpense` and the dashboard's primary CTA both gate on
  // `missingFields.length === 0`; the dashboard renders the list under
  // a disabled-looking Guardar button via formatMissingFields.
  const missingFields = useMemo<string[]>(() => {
    const missing: string[] = []
    if (!hasValidAmount) missing.push(i18n.t('gastos:import.field.amount'))
    if (description.trim().length === 0) missing.push(i18n.t('gastos:import.field.description'))
    if (!selectedCategoryId) missing.push(i18n.t('gastos:import.field.category'))
    return missing
  }, [hasValidAmount, description, selectedCategoryId])

  const submitExpense = () => {
    if (missingFields.length > 0) return
    createExpenseMutation.mutate(
      {
        categoryId: selectedCategoryId,
        description: description.trim(),
        // Pass `notes` raw — the repository's `normalizeExpenseNotes`
        // handles trim + empty→null + max-length check.
        notes,
        price: amount,
        // Back-date the movement to the target day at noon local
        // time (avoids DST edge cases + keeps it visible on the
        // intended calendar day even across timezones).
        createdAt: forDate
          ? new Date(
              forDate.getFullYear(),
              forDate.getMonth(),
              forDate.getDate(),
              12,
              0,
              0,
              0,
            ).toISOString()
          : undefined,
      },
      {
        onError: (error: unknown) => {
          showError(error, i18n.t('gastos:errors.createFailed'))
        },
        onSuccess: () => {
          void triggerHaptic('success')
          setDescription('')
          setNotes('')
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
    notes,
    expensesQuery,
    hasValidAmount,
    isNumpadVisible,
    missingFields,
    highlightToken,
    normalizeSuggestionLabel,
    rawPrice,
    quickDescriptionSuggestions,
    selectedCategoryId,
    submitExpense,
    suggestedAmounts,
    forDate,
    actions: {
      selectCategory: setCategorySelection,
      setDescription,
      setNotes,
      setRawPrice,
      setNumpadVisible,
      addQuickAmount: (delta: number) => setRawPrice(serializePrice(amount + delta)),
      clearAmount: () => setRawPrice(''),
      useQuickDescription: setDescription,
      flagMissingFields: () => setHighlightToken((t) => t + 1),
    },
  }
}
