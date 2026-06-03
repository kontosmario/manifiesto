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
  dayOfMonth: number
  notifyDaysBefore: number | null
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
  defaultKind,
  fixedExpense,
}: {
  /** Kept on the signature for callers but no longer read — we used
   *  to seed `categoryId` to `categories[0]?.id` here, but the new
   *  no-pre-select stance means a blank string is the correct initial
   *  value. The param stays so existing callers don't need updating. */
  categories?: Pick<Category, 'id'>[]
  defaultKind?: FixedExpenseKind
  fixedExpense?: FixedExpense | null
}): FixedExpenseEditorValues {
  return {
    amount: fixedExpense ? serializePrice(fixedExpense.amount) : '',
    // For new fijos (no fixedExpense) we keep categoryId empty so the
    // user picks deliberately. Editing an existing fijo still preserves
    // its category. Mirrors the no-pre-select stance from add-expense
    // and the import-review wizard.
    categoryId: fixedExpense?.category_id ?? '',
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
  /** Human-readable list of required fields the user still needs to
   *  fill. Used by the screen to render "Completá X y Z para
   *  continuar." under a look-disabled Guardar button. */
  missingFields: string[]
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

  const missingFields: string[] = []
  if (values.name.trim().length === 0) missingFields.push('nombre')
  if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) missingFields.push('monto')
  if (values.categoryId.trim().length === 0) missingFields.push('categoría')
  if (!serializedNextDueOn) missingFields.push('fecha de pago')
  if (
    values.kind === 'installment' &&
    !(Number.isInteger(parsedInstallmentsTotal) && parsedInstallmentsTotal > 0)
  ) {
    missingFields.push('total de cuotas')
  }
  if (
    values.kind === 'debt' &&
    !(Number.isFinite(parsedRemainingBalance) && parsedRemainingBalance >= 0)
  ) {
    missingFields.push('saldo pendiente')
  }
  const canSubmit = missingFields.length === 0

  if (!canSubmit || !serializedNextDueOn) {
    return {
      canSubmit,
      payload: null,
      missingFields,
    }
  }

  const dayOfMonth = (() => {
    const parsed = new Date(serializedNextDueOn)
    const day = parsed.getUTCDate()
    return Number.isFinite(day) && day >= 1 && day <= 31 ? day : 1
  })()

  return {
    canSubmit: true,
    payload: {
      amount: parsedAmount,
      categoryId: values.categoryId,
      dayOfMonth,
      notifyDaysBefore: null,
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
    missingFields,
  }
}
