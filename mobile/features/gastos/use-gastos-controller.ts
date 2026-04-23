import { useMemo, useState } from 'react'
import { useCategories } from '@/features/categories/use-categories'
import { useExpenses, type Expense } from '@/features/expenses/use-expenses'
import {
  computeAverageDailySpend,
  computeCategoryWeights,
  computeDailySpend,
  computeGastosDayMoods,
  computeRegistrationStreak,
  groupGastosByDay,
  type CategoryLite,
  type CategoryWeightRow,
  type GastosDayMood,
  type GastosGroup,
} from '@/features/gastos/gastos-aggregates.model'

export interface UseGastosControllerResult {
  // raw
  expenses: Expense[]
  categoriesById: Map<string, CategoryLite>
  isLoading: boolean
  error: unknown
  // filter state
  selectedCategoryId: string | null
  setSelectedCategoryId: (id: string | null) => void
  selectedDay: number | null
  setSelectedDay: (day: number | null) => void
  // filtered result
  filteredExpenses: Expense[]
  filteredTotal: number
  summaryChip: string
  // aggregates
  topCategories: CategoryWeightRow[]
  dayMoods: Record<number, GastosDayMood>
  dailySpend: ReturnType<typeof computeDailySpend>
  averageDaily: number
  registrationStreak: number
  groups: GastosGroup[]
  // month context
  today: Date
  monthYear: number
  monthIndex: number
  daysInMonth: number
  // actions
  clearDay: () => void
  clearAll: () => void
}

const MONTH_LABELS = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
]

export function useGastosController(familyId: string): UseGastosControllerResult {
  const [today] = useState(() => new Date())
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null)
  const [selectedDay, setSelectedDay] = useState<number | null>(null)

  const categoriesQuery = useCategories(familyId)
  const expensesQuery = useExpenses(familyId)

  const expenses = expensesQuery.data ?? []
  const categories: CategoryLite[] = (categoriesQuery.data ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    color: c.color,
  }))
  const categoriesById = useMemo(() => {
    const m = new Map<string, CategoryLite>()
    for (const c of categories) m.set(c.id, c)
    return m
  }, [categories])

  const monthYear = today.getUTCFullYear()
  const monthIndex = today.getUTCMonth()
  const daysInMonth = new Date(Date.UTC(monthYear, monthIndex + 1, 0)).getUTCDate()

  const monthExpenses = useMemo(
    () =>
      expenses.filter((e) => {
        const d = new Date(e.created_at)
        return d.getUTCFullYear() === monthYear && d.getUTCMonth() === monthIndex
      }),
    [expenses, monthYear, monthIndex],
  )

  const filteredByCategory = useMemo(
    () =>
      selectedCategoryId == null
        ? monthExpenses
        : monthExpenses.filter((e) => e.category_id === selectedCategoryId),
    [monthExpenses, selectedCategoryId],
  )

  const filteredExpenses = useMemo(
    () =>
      selectedDay == null
        ? filteredByCategory
        : filteredByCategory.filter((e) => {
            const d = new Date(e.created_at)
            return d.getUTCDate() === selectedDay
          }),
    [filteredByCategory, selectedDay],
  )

  const filteredTotal = useMemo(
    () => filteredExpenses.reduce((s, e) => s + Math.abs(Number(e.price ?? 0)), 0),
    [filteredExpenses],
  )

  const summaryChip = useMemo(() => {
    const count = filteredExpenses.length
    const period = selectedDay != null ? `día ${selectedDay}` : MONTH_LABELS[monthIndex]
    const cat =
      selectedCategoryId == null
        ? 'Todas'
        : (categoriesById.get(selectedCategoryId)?.name ?? 'Todas')
    return `${count} mov · ${period} · ${cat}`
  }, [filteredExpenses.length, selectedDay, monthIndex, selectedCategoryId, categoriesById])

  const topCategories = useMemo(
    () => computeCategoryWeights(filteredExpenses, categories, 3),
    [filteredExpenses, categories],
  )

  const dailySpend = useMemo(
    () => computeDailySpend(filteredByCategory, monthYear, monthIndex),
    [filteredByCategory, monthYear, monthIndex],
  )

  const dayMoods = useMemo(
    () => computeGastosDayMoods({ dailySpend, today }),
    [dailySpend, today],
  )

  const averageDaily = useMemo(
    () => computeAverageDailySpend({ expenses, today, windowDays: 22 }),
    [expenses, today],
  )

  const registrationStreak = useMemo(
    () => computeRegistrationStreak({ expenses, today }),
    [expenses, today],
  )

  const groups = useMemo(
    () => groupGastosByDay({ expenses: filteredExpenses, today }),
    [filteredExpenses, today],
  )

  return {
    expenses,
    categoriesById,
    isLoading: expensesQuery.isLoading || categoriesQuery.isLoading,
    error: expensesQuery.error ?? categoriesQuery.error ?? null,
    selectedCategoryId,
    setSelectedCategoryId,
    selectedDay,
    setSelectedDay,
    filteredExpenses,
    filteredTotal,
    summaryChip,
    topCategories,
    dayMoods,
    dailySpend,
    averageDaily,
    registrationStreak,
    groups,
    today,
    monthYear,
    monthIndex,
    daysInMonth,
    clearDay: () => setSelectedDay(null),
    clearAll: () => {
      setSelectedDay(null)
      setSelectedCategoryId(null)
    },
  }
}
