import type { Category } from '@/features/categories/use-categories'
import type { BreakdownEntry, ExpenseHistorySnapshot } from '@/features/expenses/expense-history.types'
import type { Expense } from '@/features/expenses/use-expenses'

export function buildExpenseBreakdown({
  categoryById,
  filteredExpenses,
  primaryColor,
  selectedCategoryId,
  successColor,
  warningColor,
}: {
  categoryById: Map<string, Category>
  filteredExpenses: Expense[]
  primaryColor: string
  selectedCategoryId: string
  successColor: string
  warningColor: string
}): ExpenseHistorySnapshot['breakdown'] {
  if (filteredExpenses.length === 0) {
    return {
      rows: [],
      title: '',
    }
  }

  if (!selectedCategoryId) {
    const totalsByCategory = new Map<string, BreakdownEntry>()

    filteredExpenses.forEach((expense) => {
      const category = categoryById.get(expense.category_id)
      const previous = totalsByCategory.get(expense.category_id)

      totalsByCategory.set(expense.category_id, {
        color: category?.color ?? primaryColor,
        label: category?.name ?? 'Sin categoria',
        total: (previous?.total ?? 0) + expense.price,
      })
    })

    return {
      rows: [...totalsByCategory.values()]
        .sort((first, second) => second.total - first.total)
        .slice(0, 3),
      title: 'Mas peso por categoria',
    }
  }

  const totalsByCreator = new Map<string, number>()
  const creatorPalette = [primaryColor, successColor, warningColor]

  filteredExpenses.forEach((expense) => {
    totalsByCreator.set(
      expense.creator_display_name,
      (totalsByCreator.get(expense.creator_display_name) ?? 0) + expense.price,
    )
  })

  return {
    rows: [...totalsByCreator.entries()]
      .sort((first, second) => second[1] - first[1])
      .slice(0, 3)
      .map(([label, total], index) => ({
        color: creatorPalette[index % creatorPalette.length],
        label,
        total,
      })),
    title: 'Mas peso por persona',
  }
}
