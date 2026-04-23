import { supabase } from '@/lib/supabase'
import type {
  ExpenseMonthRow,
  FamilyMonthlySpent,
} from '@/features/expenses/expense-repository.model'

async function fetchExpenseRows(
  familyId: string,
  filters?: {
    endIso?: string
    startIso?: string
  },
) {
  let query = supabase.from('expenses').select('price, created_at').eq('family_id', familyId)

  if (filters?.startIso) {
    query = query.gte('created_at', filters.startIso)
  }

  if (filters?.endIso) {
    query = query.lt('created_at', filters.endIso)
  }

  const { data, error } = await query

  if (error) {
    throw error
  }

  return (data ?? []) as ExpenseMonthRow[]
}

export async function fetchFamilyTotal(familyId: string) {
  const rows = await fetchExpenseRows(familyId)
  return rows.reduce((sum, row) => sum + Number(row.price ?? 0), 0)
}

export async function fetchFamilyPeriodTotal(
  familyId: string,
  startIso: string,
  endIso: string,
) {
  const rows = await fetchExpenseRows(familyId, {
    endIso,
    startIso,
  })
  return rows.reduce((sum, row) => sum + Number(row.price ?? 0), 0)
}

export async function fetchFamilyMonthlySpent(familyId: string, monthsBack: number) {
  const now = new Date()
  const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1)
  const firstMonthStart = new Date(
    currentMonthStart.getFullYear(),
    currentMonthStart.getMonth() - (monthsBack - 1),
    1,
  )
  const rows = await fetchExpenseRows(familyId, {
    endIso: nextMonthStart.toISOString(),
    startIso: firstMonthStart.toISOString(),
  })

  const totalsByMonth = new Map<string, number>()

  rows.forEach((row) => {
    const createdAtDate = new Date(row.created_at)
    if (Number.isNaN(createdAtDate.getTime())) {
      return
    }

    const monthStart = new Date(createdAtDate.getFullYear(), createdAtDate.getMonth(), 1)
    const monthKey = monthStart.toISOString()
    const previous = totalsByMonth.get(monthKey) ?? 0
    totalsByMonth.set(monthKey, previous + Number(row.price ?? 0))
  })

  const monthlySeries: FamilyMonthlySpent[] = []
  for (let offset = 0; offset < monthsBack; offset += 1) {
    const monthStart = new Date(
      currentMonthStart.getFullYear(),
      currentMonthStart.getMonth() - offset,
      1,
    )
    const monthStartIso = monthStart.toISOString()

    monthlySeries.push({
      monthStartIso,
      totalSpent: totalsByMonth.get(monthStartIso) ?? 0,
    })
  }

  return monthlySeries
}
