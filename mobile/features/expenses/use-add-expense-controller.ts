import { useMemo } from 'react'
import {
  type CategoryTemplate,
  useCategoryTemplates,
} from '@/features/categories/use-category-templates'
import { type Category, useCategories } from '@/features/categories/use-categories'
import { localizeQuickDescriptions } from '@/features/categories/localize-category-name'
import { filterVariableExpenseCategories } from '@/features/expenses/variable-expense-categories'
import { type Expense, useCreateExpense, useExpenses } from '@/features/expenses/use-expenses'
import {
  rankCategoriesByUsage,
  pickTopCategoryDescriptions,
} from '@/features/expenses/category-ranking'

const EMPTY_CATEGORIES: Category[] = []
const EMPTY_CATEGORY_TEMPLATES: CategoryTemplate[] = []
const EMPTY_EXPENSES: Expense[] = []
const MAX_QUICK_DESCRIPTION_SUGGESTIONS = 6
const QUICK_AMOUNTS = [5000, 15000, 30000, 50000, 100000] as const

function normalizeSuggestionLabel(value: string) {
  // NO display: normalización para matching/dedup de sugerencias (case- y
  // acento-insensible). El locale 'es-AR' acá no es formato visible sino la
  // semántica de lowercase; se mantiene fijo a propósito (no locale-aware).
  return value
    .trim()
    .toLocaleLowerCase('es-AR')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
}

/**
 * Categorías VARIABLES del hogar (las de gasto del día a día).
 *
 * Existe suelto —y no sólo adentro del controller— porque el wizard necesita
 * el catálogo ANTES de tener una categoría elegida: el gate del paso 1 valida
 * que el id todavía resuelva, y ese validador se le pasa a
 * `useAddExpenseForm`, cuyo `categoryId` es a su vez lo que el controller
 * necesita para sugerir descripciones. Sin este corte los dos hooks se
 * necesitan mutuamente. Llamarlo dos veces en el mismo árbol no cuesta una
 * request de más: es la misma query key que resuelve el controller.
 */
export function useVariableExpenseCategories(familyId: string) {
  const categoriesQuery = useCategories(familyId)
  // Oculta las categorías sólo-fijas (Alquiler, Servicios, Suscripciones) del
  // picker de gastos variables. La capa de datos las deja en scope='expense'
  // para que el alta de fijos siga viendo el catálogo completo; el filtro es
  // local a este flujo.
  const categories = useMemo(
    () => filterVariableExpenseCategories(categoriesQuery.data ?? EMPTY_CATEGORIES),
    [categoriesQuery.data],
  )
  return { categoriesQuery, categories }
}

interface UseAddExpenseControllerParams {
  familyId: string
  userId: string
  /**
   * Categoría elegida en el formulario. Entra por parámetro —y no como estado
   * propio de este hook— porque el ESTADO del alta vive entero en
   * `useAddExpenseForm`: dos copias del mismo campo (una para los gates, otra
   * para las sugerencias) se desincronizan en cuanto alguien escribe un
   * `setState` de más. Acá sólo se deriva.
   */
  selectedCategoryId: string
}

/**
 * Datos y mutación del alta de gasto: catálogo de categorías variables,
 * ranking por uso, sugerencias de descripción y `createExpenseMutation`.
 *
 * NO tiene estado de formulario. Monto, descripción, notas, fecha, paso y
 * campos faltantes viven en `useAddExpenseForm`; el submit lo dispara la
 * pantalla con los valores de ese hook. Este es el borde de datos.
 */
export function useAddExpenseController({
  familyId,
  userId,
  selectedCategoryId,
}: UseAddExpenseControllerParams) {
  const { categoriesQuery, categories } = useVariableExpenseCategories(familyId)
  const categoryTemplatesQuery = useCategoryTemplates()
  const expensesQuery = useExpenses(familyId)
  const createExpenseMutation = useCreateExpense(familyId, userId)
  const categoryTemplates = categoryTemplatesQuery.data ?? EMPTY_CATEGORY_TEMPLATES
  // Las sugerencias y el ranking sólo aprenden de gastos MANUALES (los
  // patrones que el usuario tipea). Los pagos de fijos se generan solos al
  // marcarlos pagados: sesgarían tanto las descripciones como las categorías
  // más usadas hacia la categoría de fijos, en la que nadie escribe.
  const expenses = useMemo(
    () => (expensesQuery.data ?? EMPTY_EXPENSES).filter((e) => !e.commitment_id),
    [expensesQuery.data],
  )

  const selectedCategory = categories.find((c) => c.id === selectedCategoryId) ?? null

  const quickDescriptionSuggestions = useMemo(() => {
    if (!selectedCategory) return []
    const matchedTemplate =
      categoryTemplates.find((t) => t.id === selectedCategory.template_id) ??
      categoryTemplates.find((t) => t.name === selectedCategory.name) ??
      null
    // Localización NO destructiva de los quick_descriptions del template
    // (estos NO son datos del usuario — viven en category_templates).
    // El `name` del template es el default ES (key estable). Este flujo
    // es siempre de categorías variables → scope 'expense'.
    const templateDescriptions = matchedTemplate
      ? localizeQuickDescriptions(
          'expense',
          matchedTemplate.name,
          matchedTemplate.quickDescriptions,
        )
      : []
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

  return {
    categories,
    categoriesQuery,
    createExpenseMutation,
    /** Gastos VARIABLES del hogar (sin pagos de fijos). */
    expenses,
    expensesQuery,
    quickDescriptionSuggestions,
    rankedCategories,
    selectedCategory,
    suggestedAmounts,
  }
}
