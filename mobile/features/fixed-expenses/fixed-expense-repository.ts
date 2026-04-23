import { supabase } from '@/lib/supabase'
import {
  asFixedExpense,
  buildFixedExpensePayload,
  isMissingCommitmentColumnsError,
  isMissingFixedExpensesTableError,
  throwMigrationError,
  type UpdateFixedExpenseInput,
  type UpsertFixedExpenseInput,
} from '@/features/fixed-expenses/fixed-expense-repository.model'
import {
  type FixedExpense,
  type FixedExpenseStatus,
} from '@/features/fixed-expenses/fixed-expense-types'
export type {
  UpdateFixedExpenseInput,
  UpsertFixedExpenseInput,
} from '@/features/fixed-expenses/fixed-expense-repository.model'

export async function fetchFixedExpenses(familyId: string) {
  let response = await supabase
    .from('fixed_expenses')
    .select('*')
    .eq('family_id', familyId)
    .order('status', { ascending: true })
    .order('next_due_on', { ascending: true })
    .order('created_at', { ascending: true })

  if (response.error && isMissingCommitmentColumnsError(response.error)) {
    response = await supabase
      .from('fixed_expenses')
      .select('*')
      .eq('family_id', familyId)
      .order('created_at', { ascending: true })
  }

  if (response.error) {
    if (isMissingFixedExpensesTableError(response.error)) {
      return []
    }

    throw response.error
  }

  return ((response.data as FixedExpense[] | null) ?? []).map(asFixedExpense)
}

export async function createFixedExpense(familyId: string, input: UpsertFixedExpenseInput) {
  const payload = buildFixedExpensePayload(input)

  const { error } = await supabase.from('fixed_expenses').insert({
    family_id: familyId,
    ...payload,
  })

  if (error) {
    throwMigrationError(error)
  }
}

export async function updateFixedExpense(
  familyId: string,
  { fixedExpenseId, ...input }: UpdateFixedExpenseInput,
) {
  const payload = buildFixedExpensePayload({
    ...input,
    allowZeroDebtBalance: true,
  })

  const { error } = await supabase
    .from('fixed_expenses')
    .update(payload)
    .eq('id', fixedExpenseId)
    .eq('family_id', familyId)

  if (error) {
    throwMigrationError(error)
  }
}

export async function updateFixedExpenseStatus(
  familyId: string,
  fixedExpenseId: string,
  status: FixedExpenseStatus,
) {
  const { error } = await supabase
    .from('fixed_expenses')
    .update({ status })
    .eq('id', fixedExpenseId)
    .eq('family_id', familyId)

  if (error) {
    throwMigrationError(error)
  }
}

export async function recordFixedExpensePayment(fixedExpenseId: string) {
  const sessionResponse = await supabase.auth.getSession()
  if (sessionResponse.error) {
    throw sessionResponse.error
  }

  if (!sessionResponse.data.session?.user?.id) {
    throw new Error(
      'Tu sesion vencio. Volve a iniciar sesion antes de registrar un pago.',
    )
  }

  const { error } = await supabase.rpc('record_fixed_expense_payment', {
    p_fixed_expense_id: fixedExpenseId,
  })

  if (error) {
    throwMigrationError(error)
  }
}

export async function deleteFixedExpense(familyId: string, fixedExpenseId: string) {
  const { error } = await supabase
    .from('fixed_expenses')
    .delete()
    .eq('id', fixedExpenseId)
    .eq('family_id', familyId)

  if (error) {
    throwMigrationError(error)
  }
}
