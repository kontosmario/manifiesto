import type { Category } from '@/features/categories/use-categories'
import type { Expense } from '@/features/expenses/use-expenses'

export function rankCategoriesByUsage(
  expenses: Expense[],
  categories: Category[],
  limit?: number,
): Category[] {
  const counts = new Map<string, number>()
  for (const expense of expenses) {
    counts.set(expense.category_id, (counts.get(expense.category_id) ?? 0) + 1)
  }
  const ranked = [...categories].sort((a, b) => {
    const diff = (counts.get(b.id) ?? 0) - (counts.get(a.id) ?? 0)
    if (diff !== 0) return diff
    return a.name.localeCompare(b.name)
  })
  return typeof limit === 'number' ? ranked.slice(0, limit) : ranked
}

export function pickTopCategoryDescriptions(
  expenses: Expense[],
  categoryId: string,
  limit: number,
): string[] {
  const counts = new Map<string, number>()
  for (const expense of expenses) {
    if (expense.category_id !== categoryId) continue
    const trimmed = expense.description.trim()
    if (!trimmed) continue
    counts.set(trimmed, (counts.get(trimmed) ?? 0) + 1)
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([description]) => description)
}
