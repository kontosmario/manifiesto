import type { Category } from '@/features/categories/use-categories'
import {
  formatFixedExpenseDateInput,
  serializeFixedExpenseDateInput,
} from '@/features/fixed-expenses/commitment-utils'
import {
  type FixedExpense,
  type FixedExpenseFrequency,
  type FixedExpenseKind,
  type FixedExpenseStatus,
} from '@/features/fixed-expenses/fixed-expense-types'
import { parsePrice, serializePrice } from '@/utils/money'

export interface FixedExpenseEditorValues {
  amount: string
  categoryId: string
  endsOn: string
  frequency: FixedExpenseFrequency
  installmentsPaid: string
  installmentsTotal: string
  kind: FixedExpenseKind
  lenderName: string
  name: string
  nextDueOn: string
  notes: string
  remainingBalance: string
  status: FixedExpenseStatus
}

export interface FixedExpenseEditorSubmitPayload {
  amount: number
  categoryId: string
  endsOn: string | null
  frequency: FixedExpenseFrequency
  installmentsPaid: number
  installmentsTotal: number | null
  kind: FixedExpenseKind
  lenderName: string | null
  name: string
  nextDueOn: string
  notes: string | null
  remainingBalance: number | null
  status: FixedExpenseStatus
}

export function buildFixedExpenseEditorInitialValues({
  categories,
  defaultKind,
  fixedExpense,
}: {
  categories: Pick<Category, 'id'>[]
  defaultKind?: FixedExpenseKind
  fixedExpense?: FixedExpense | null
}): FixedExpenseEditorValues {
  return {
    amount: fixedExpense ? serializePrice(fixedExpense.amount) : '',
    categoryId: fixedExpense?.category_id ?? categories[0]?.id ?? '',
    endsOn: formatFixedExpenseDateInput(fixedExpense?.ends_on ?? null),
    frequency: fixedExpense?.frequency ?? 'monthly',
    installmentsPaid: fixedExpense?.installments_paid ? String(fixedExpense.installments_paid) : '0',
    installmentsTotal: fixedExpense?.installments_total ? String(fixedExpense.installments_total) : '',
    kind: fixedExpense?.kind ?? defaultKind ?? 'recurring',
    lenderName: fixedExpense?.lender_name ?? '',
    name: fixedExpense?.name ?? '',
    nextDueOn: formatFixedExpenseDateInput(fixedExpense?.next_due_on ?? null),
    notes: fixedExpense?.notes ?? '',
    remainingBalance:
      fixedExpense?.remaining_balance !== null && fixedExpense?.remaining_balance !== undefined
        ? serializePrice(fixedExpense.remaining_balance)
        : '',
    status: fixedExpense?.status ?? 'active',
  }
}

export function buildFixedExpenseSubmitState(values: FixedExpenseEditorValues): {
  canSubmit: boolean
  payload: FixedExpenseEditorSubmitPayload | null
} {
  const parsedAmount = parsePrice(values.amount)
  const parsedRemainingBalance =
    values.remainingBalance.trim().length > 0 ? parsePrice(values.remainingBalance) : Number.NaN
  const parsedInstallmentsTotal =
    values.installmentsTotal.trim().length > 0 ? Number(values.installmentsTotal) : Number.NaN
  const parsedInstallmentsPaid =
    values.installmentsPaid.trim().length > 0 ? Number(values.installmentsPaid) : Number.NaN
  const serializedNextDueOn = serializeFixedExpenseDateInput(values.nextDueOn)
  const serializedEndsOn = serializeFixedExpenseDateInput(values.endsOn)

  const canSubmit =
    values.name.trim().length > 0 &&
    Number.isFinite(parsedAmount) &&
    parsedAmount > 0 &&
    values.categoryId.trim().length > 0 &&
    Boolean(serializedNextDueOn) &&
    (values.kind !== 'installment' ||
      (Number.isInteger(parsedInstallmentsTotal) && parsedInstallmentsTotal > 0)) &&
    (values.kind !== 'debt' ||
      (Number.isFinite(parsedRemainingBalance) && parsedRemainingBalance >= 0))

  if (!canSubmit || !serializedNextDueOn) {
    return {
      canSubmit,
      payload: null,
    }
  }

  return {
    canSubmit: true,
    payload: {
      amount: parsedAmount,
      categoryId: values.categoryId,
      endsOn: serializedEndsOn,
      frequency: values.frequency,
      installmentsPaid:
        Number.isInteger(parsedInstallmentsPaid) && parsedInstallmentsPaid >= 0
          ? parsedInstallmentsPaid
          : 0,
      installmentsTotal:
        Number.isInteger(parsedInstallmentsTotal) && parsedInstallmentsTotal > 0
          ? parsedInstallmentsTotal
          : null,
      kind: values.kind,
      lenderName: values.lenderName.trim() || null,
      name: values.name,
      nextDueOn: serializedNextDueOn,
      notes: values.notes.trim() || null,
      remainingBalance:
        Number.isFinite(parsedRemainingBalance) && parsedRemainingBalance >= 0
          ? parsedRemainingBalance
          : null,
      status: values.status,
    },
  }
}
