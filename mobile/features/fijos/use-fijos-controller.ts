import { useMemo, useState } from 'react'
import { useCategories } from '@/features/categories/use-categories'
import { useFamilyFinance } from '@/features/finance/use-family-finance'
import { useFixedExpenses } from '@/features/fixed-expenses/use-fixed-expenses'
import { useFixedExpensePayments } from '@/features/fixed-expenses/use-fixed-expense-payments'
import {
  groupFijosByCategory,
  summarizeFijos,
  type FijoCategoryGroup,
  type FijoItem,
  type FijosCycleSummary,
} from '@/features/fijos/fijos-aggregates.model'

export type FijosTab = 'todos' | 'pendientes' | 'pagados' | 'zombis'

export interface UseFijosControllerResult {
  isLoading: boolean
  error: unknown
  summary: FijosCycleSummary
  allItems: FijoItem[]
  filteredItems: FijoItem[]
  groups: FijoCategoryGroup[]
  tab: FijosTab
  setTab: (tab: FijosTab) => void
  monthlyIncome: number
  freeAfterFijos: number
  pctOfIncome: number
  today: Date
}

const DEFAULT_SUMMARY: FijosCycleSummary = {
  total: 0,
  paidAmount: 0,
  pendingAmount: 0,
  overdueAmount: 0,
  paidPct: 0,
  pendingPct: 0,
  overduePct: 0,
  paidItems: [],
  pendingItems: [],
  overdueItems: [],
  upcoming: [],
  zombies: [],
  daysToNextPayment: null,
  todayDay: 1,
  daysInMonth: 30,
  daysRemaining: 30,
}

export function useFijosController(familyId: string): UseFijosControllerResult {
  const [today] = useState(() => new Date())
  const [tab, setTab] = useState<FijosTab>('todos')

  const categoriesQuery = useCategories(familyId)
  const fixedExpensesQuery = useFixedExpenses(familyId)
  const financeQuery = useFamilyFinance(familyId)

  const items = fixedExpensesQuery.data ?? []
  const fixedExpenseIds = useMemo(() => items.map((i) => i.id), [items])
  const paymentsQuery = useFixedExpensePayments({
    familyId,
    fixedExpenseIds,
    today,
  })

  const summary = useMemo(() => {
    if (items.length === 0) return DEFAULT_SUMMARY
    return summarizeFijos({
      items,
      paymentsThisMonth: paymentsQuery.data ?? [],
      today,
    })
  }, [items, paymentsQuery.data, today])

  const allItems = useMemo(
    () => [...summary.paidItems, ...summary.pendingItems, ...summary.overdueItems],
    [summary.paidItems, summary.pendingItems, summary.overdueItems],
  )

  const filteredItems = useMemo(() => {
    if (tab === 'pendientes') return [...summary.pendingItems, ...summary.overdueItems]
    if (tab === 'pagados') return summary.paidItems
    if (tab === 'zombis') return summary.zombies
    return allItems
  }, [tab, summary, allItems])

  const categories = useMemo(
    () =>
      (categoriesQuery.data ?? []).map((c) => ({
        id: c.id,
        name: c.name,
        color: c.color,
      })),
    [categoriesQuery.data],
  )

  const groups = useMemo(
    () => groupFijosByCategory({ items: filteredItems, categories }),
    [filteredItems, categories],
  )

  const monthlyIncome = financeQuery.data?.monthly_income ?? 0
  const freeAfterFijos = Math.max(0, monthlyIncome - summary.total)
  const pctOfIncome =
    monthlyIncome > 0 ? Math.round((summary.total / monthlyIncome) * 100) : 0

  return {
    isLoading:
      fixedExpensesQuery.isLoading ||
      categoriesQuery.isLoading ||
      financeQuery.isLoading,
    error: fixedExpensesQuery.error ?? categoriesQuery.error ?? financeQuery.error ?? null,
    summary,
    allItems,
    filteredItems,
    groups,
    tab,
    setTab,
    monthlyIncome,
    freeAfterFijos,
    pctOfIncome,
    today,
  }
}
