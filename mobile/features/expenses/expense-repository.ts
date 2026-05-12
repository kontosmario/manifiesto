import { supabase } from '@/lib/supabase'
import {
  enrichExpenses,
  enrichExpensesFromEmbed,
} from '@/features/expenses/expense-repository-enrichment'
import {
  buildExpenseInsertPayload,
  isMissingCommitmentIdColumnError,
  normalizeExpenseNotes,
  validateExpenseDescription,
  validateExpensePrice,
  type CreateExpenseInput,
  type Expense,
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

function applyExpenseFilters<Q extends {
  eq: (col: string, val: unknown) => Q
  gte: (col: string, val: unknown) => Q
  lt: (col: string, val: unknown) => Q
  limit: (n: number) => Q
}>(query: Q, filters: ExpenseQueryFilters): Q {
  let q = query
  if (filters.categoryId) q = q.eq('category_id', filters.categoryId)
  if (filters.createdAtGte) q = q.gte('created_at', filters.createdAtGte)
  if (filters.createdAtLt) q = q.lt('created_at', filters.createdAtLt)
  if (typeof filters.limit === 'number' && filters.limit > 0) {
    q = q.limit(filters.limit)
  }
  return q
}

/**
 * Single-column list — used by the legacy fallback when the modern
 * embed select fails. The embed select adds `profiles!inner(display_name)`
 * to fetch the creator name in the same round-trip (audit §3.3).
 */
const EXPENSE_COLUMNS =
  'id, family_id, category_id, commitment_id, description, notes, price, created_by, created_at'

const EXPENSE_COLUMNS_WITH_PROFILE = `${EXPENSE_COLUMNS}, profiles!expenses_created_by_profile_fkey(display_name)`

// Legacy column list — used only on schemas that predate the
// commitment_id + notes columns. Both columns are nullable so falling
// back to the older select shape is safe for ancient envs; modern
// prod and staging always go through the embed path above.
const EXPENSE_COLUMNS_LEGACY =
  'id, family_id, category_id, description, price, created_by, created_at'

export async function loadExpenses(
  familyId: string,
  filters: ExpenseQueryFilters = {},
): Promise<Expense[]> {
  // Primary path: embed `profiles` via the FK declared in
  // 20260504000000_expenses_profile_fk.sql — 1 round-trip total.
  const embedRequest = supabase
    .from('expenses')
    .select(EXPENSE_COLUMNS_WITH_PROFILE)
    .eq('family_id', familyId)
    .order('created_at', { ascending: false })

  const embedResponse = await applyExpenseFilters(embedRequest, filters)

  if (!embedResponse.error) {
    // PostgREST types many-to-one embeds as arrays by default, even
    // though `created_by` is a single FK. Cast through unknown and let
    // `enrichExpensesFromEmbed` normalize either shape (object or
    // single-element array).
    const rows = (embedResponse.data ?? []) as unknown as Array<
      RawExpense & {
        profiles?:
          | { display_name: string }
          | { display_name: string }[]
          | null
      }
    >
    return enrichExpensesFromEmbed(rows)
  }

  // Fallback path 1: missing commitment_id column (very-old schemas).
  if (isMissingCommitmentIdColumnError(embedResponse.error)) {
    const legacyBase = supabase
      .from('expenses')
      .select(EXPENSE_COLUMNS_LEGACY)
      .eq('family_id', familyId)
      .order('created_at', { ascending: false })

    const legacyResponse = await applyExpenseFilters(legacyBase, filters)
    if (legacyResponse.error) throw legacyResponse.error
    return enrichExpenses(legacyResponse.data as RawExpense[])
  }

  // Fallback path 2: PostgREST didn't infer the relationship (e.g.,
  // schema cache stale, or the FK migration hasn't landed yet on this
  // env). Re-issue without the embed and fall back to the 2-round-trip
  // enrichment via the profiles cache.
  if (isMissingProfilesEmbedError(embedResponse.error)) {
    const baseRequest = supabase
      .from('expenses')
      .select(EXPENSE_COLUMNS)
      .eq('family_id', familyId)
      .order('created_at', { ascending: false })

    const baseResponse = await applyExpenseFilters(baseRequest, filters)
    if (baseResponse.error) throw baseResponse.error
    return enrichExpenses(baseResponse.data as RawExpense[])
  }

  throw embedResponse.error
}

/**
 * PostgREST signals an unknown embed relationship with code PGRST200.
 * Detect that exact case so the legacy fallback only triggers when the
 * schema cache has not seen the new FK yet.
 */
function isMissingProfilesEmbedError(error: { code?: string; message?: string }): boolean {
  const code = error.code ?? ''
  const text = (error.message ?? '').toLowerCase()
  return code === 'PGRST200' || text.includes('relationship') || text.includes('embed')
}

export async function createExpense(
  familyId: string,
  userId: string,
  { categoryId, commitmentId, createdAt, description, notes, price }: CreateExpenseInput,
) {
  const normalizedDescription = validateExpenseDescription(description)
  const normalizedNotes = normalizeExpenseNotes(notes)
  validateExpensePrice(price)
  const insertPayload = buildExpenseInsertPayload({
    categoryId,
    commitmentId,
    createdAt,
    description: normalizedDescription,
    notes: normalizedNotes,
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
  { expenseId, description, notes, price }: UpdateExpenseInput,
) {
  const normalizedDescription = validateExpenseDescription(description)
  validateExpensePrice(price)

  // `notes === undefined` → no toca el campo (preserva el valor previo).
  // `notes === null` o `""` → lo limpia (vuelve a null en DB).
  // string con contenido → reemplaza.
  const updatePayload: { description: string; price: number; notes?: string | null } = {
    description: normalizedDescription,
    price,
  }
  if (notes !== undefined) {
    updatePayload.notes = normalizeExpenseNotes(notes)
  }

  const { error } = await supabase
    .from('expenses')
    .update(updatePayload)
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
