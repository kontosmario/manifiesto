import { supabase } from '@/lib/supabase'
import i18n from '@/lib/i18n'
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

export async function createFixedExpense(
  familyId: string,
  input: UpsertFixedExpenseInput,
): Promise<{ id: string } | null> {
  const payload = buildFixedExpensePayload(input)

  const { data, error } = await supabase
    .from('fixed_expenses')
    .insert({
      family_id: familyId,
      ...payload,
    })
    .select('id')
    .single()

  if (error) {
    throwMigrationError(error)
  }
  // `select().single()` devuelve {id} cuando hubo insert exitoso. La
  // form de "Crear + marcar como ya pagado" usa este id para encadenar
  // `recordFixedExpensePayment` sin un round-trip extra de query.
  return (data ?? null) as { id: string } | null
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

export interface RecordFixedExpensePaymentInput {
  fixedExpenseId: string
  /**
   * Monto realmente pagado. Cuando se omite (sheet cerrado o 1er pago
   * directo), la RPC usa el `amount` actual del commitment. Cuando se
   * pasa, la RPC:
   *   1) usa este valor como `price` del expense generado,
   *   2) si difiere del `amount` actual, lo persiste como nuevo amount
   *      base del commitment (los próximos pagos arrancan desde aquí),
   *   3) genera el chip "Aumento de precio" / "Incremento con intereses"
   *      en función del flag `paid_in_arrears` que setea el RPC.
   * Migración: 20260530120000_record_fixed_payment_amount_override.sql.
   */
  amountOverride?: number
}

export async function recordFixedExpensePayment(
  input: RecordFixedExpensePaymentInput,
) {
  const sessionResponse = await supabase.auth.getSession()
  if (sessionResponse.error) {
    throw sessionResponse.error
  }

  if (!sessionResponse.data.session?.user?.id) {
    throw new Error(i18n.t('fijos:errors.sessionExpiredPayment'))
  }

  // Cliente valida antes del round-trip — la RPC también valida (defense
  // in depth) pero queremos error sincrónico para que la sheet
  // mantenga foco/UX limpio sin un round-trip wasted.
  if (typeof input.amountOverride === 'number') {
    if (
      !Number.isFinite(input.amountOverride) ||
      input.amountOverride <= 0
    ) {
      throw new Error(i18n.t('fijos:errors.paymentAmountPositive'))
    }
  }

  const params: Record<string, unknown> = {
    p_fixed_expense_id: input.fixedExpenseId,
  }
  if (typeof input.amountOverride === 'number') {
    params.p_amount_override = input.amountOverride
  }

  const { error } = await supabase.rpc('record_fixed_expense_payment', params)

  if (error) {
    throwMigrationError(error)
  }
}

/**
 * Revierte un pago confirmado: borra el expense generado, borra el
 * payment row, retrocede `next_due_on` al período del payment, restaura
 * `last_paid_at` al penúltimo pago. Migración 20260530180000.
 *
 * Caller pasa el `paymentId` (uuid del row de fixed_expense_payments).
 * El cliente lo obtiene del summary del controller (cada FijoItem
 * paid tiene un payment record con id resoluble).
 */
export async function revertFixedExpensePayment(paymentId: string) {
  const sessionResponse = await supabase.auth.getSession()
  if (sessionResponse.error) {
    throw sessionResponse.error
  }
  if (!sessionResponse.data.session?.user?.id) {
    throw new Error(i18n.t('fijos:errors.sessionExpiredRevert'))
  }
  const { error } = await supabase.rpc('revert_fixed_expense_payment', {
    p_payment_id: paymentId,
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
