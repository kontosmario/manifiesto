import type { Category } from '@/features/categories/use-categories'

export const ALL_CATEGORIES_KEY = 'all'

export const PERIOD_OPTIONS = [
  { key: 'cycle', labelKey: 'gastos:filtersScreen.periodOptions.cycle' },
  { key: 'week', labelKey: 'gastos:filtersScreen.periodOptions.week' },
  { key: 'today', labelKey: 'gastos:filtersScreen.periodOptions.today' },
  { key: 'all', labelKey: 'gastos:filtersScreen.periodOptions.all' },
] as const

export type PeriodFilter = (typeof PERIOD_OPTIONS)[number]['key']

export function resolveSelectedCategoryId(
  categories: Category[],
  categorySelection: string,
): string {
  if (categorySelection === ALL_CATEGORIES_KEY) {
    return ''
  }

  return categories.some((category) => category.id === categorySelection) ? categorySelection : ''
}

export function resolveManagedCategoryId({
  categories,
  fallbackCategoryId,
  managedCategorySelection,
}: {
  categories: Category[]
  fallbackCategoryId?: string | null
  managedCategorySelection?: string | null
}): string {
  if (
    managedCategorySelection &&
    categories.some((category) => category.id === managedCategorySelection)
  ) {
    return managedCategorySelection
  }

  if (fallbackCategoryId && categories.some((category) => category.id === fallbackCategoryId)) {
    return fallbackCategoryId
  }

  return categories[0]?.id ?? ''
}
