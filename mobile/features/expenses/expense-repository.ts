import { supabase } from '@/lib/supabase'
import { enrichExpenses } from '@/features/expenses/expense-repository-enrichment'
import {
  buildExpenseInsertPayload,
  isMissingCommitmentIdColumnError,
  validateExpenseDescription,
  validateExpensePrice,
  type CreateExpenseInput,
  type ExpenseQueryFilters,
  type RawExpense,
  type UpdateExpenseInput,
} from '@/features/expenses/expense-repository.model'

export type {
  CreateExpenseInput,
  Expense,
  FamilyMonthlySpent,
  UpdateExpenseInput,
} from '@/features/expenses/expense-repository.model'

export {
  fetchFamilyMonthlySpent,
  fetchFamilyPeriodTotal,
  fetchFamilyTotal,
} from '@/features/expenses/expense-repository-metrics'

export async function loadExpenses(familyId: string, filters: ExpenseQueryFilters = {}) {
  let expensesRequest = supabase
    .from('expenses')
    .select('id, family_id, category_id, commitment_id, description, price, created_by, created_at')
    .eq('family_id', familyId)
    .order('created_at', { ascending: false })

  if (filters.categoryId) {
    expensesRequest = expensesRequest.eq('category_id', filters.categoryId)
  }

  if (typeof filters.limit === 'number' && filters.limit > 0) {
    expensesRequest = expensesRequest.limit(filters.limit)
  }

  const expensesResponse = await expensesRequest

  if (expensesResponse.error && isMissingCommitmentIdColumnError(expensesResponse.error)) {
    let legacyRequest = supabase
      .from('expenses')
      .select('id, family_id, category_id, description, price, created_by, created_at')
      .eq('family_id', familyId)
      .order('created_at', { ascending: false })

    if (filters.categoryId) {
      legacyRequest = legacyRequest.eq('category_id', filters.categoryId)
    }

    if (typeof filters.limit === 'number' && filters.limit > 0) {
      legacyRequest = legacyRequest.limit(filters.limit)
    }

    const legacyResponse = await legacyRequest

    if (legacyResponse.error) {
      throw legacyResponse.error
    }

    const rows = (legacyResponse.data ?? []) as RawExpense[]
    return enrichExpenses(rows)
  }

  if (expensesResponse.error) {
    throw expensesResponse.error
  }

  const rows = (expensesResponse.data ?? []) as RawExpense[]
  return enrichExpenses(rows)
}

export async function createExpense(
  familyId: string,
  userId: string,
  { categoryId, commitmentId, createdAt, description, price }: CreateExpenseInput,
) {
  const normalizedDescription = validateExpenseDescription(description)
  validateExpensePrice(price)
  const insertPayload = buildExpenseInsertPayload({
    categoryId,
    commitmentId,
    createdAt,
    description: normalizedDescription,
    familyId,
    price,
    userId,
  })

  const { error } = await supabase.from('expenses').insert(insertPayload)

  if (error) {
    throw error
  }
}

export async function updateExpense(
  familyId: string,
  { expenseId, description, price }: UpdateExpenseInput,
) {
  const normalizedDescription = validateExpenseDescription(description)
  validateExpensePrice(price)

  const { error } = await supabase
    .from('expenses')
    .update({
      description: normalizedDescription,
      price,
    })
    .eq('id', expenseId)
    .eq('family_id', familyId)

  if (error) {
    throw error
  }
}

export async function deleteExpense(familyId: string, expenseId: string) {
  const { error } = await supabase
    .from('expenses')
    .delete()
    .eq('id', expenseId)
    .eq('family_id', familyId)

  if (error) {
    throw error
  }
}

export async function clearFamilyExpenses(familyId: string) {
  const { error } = await supabase
    .from('expenses')
    .delete()
    .eq('family_id', familyId)

  if (error) {
    throw error
  }
}
