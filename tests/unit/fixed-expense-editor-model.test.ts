import { describe, expect, it } from 'vitest'
import {
  buildFixedExpenseEditorInitialValues,
  buildFixedExpenseSubmitState,
} from '@/features/fixed-expenses/fixed-expense-editor-model'

describe('fixed-expense-editor-model', () => {
  it('arma payload valido para un gasto recurrente', () => {
    const result = buildFixedExpenseSubmitState({
      amount: '125000',
      categoryId: 'rent',
      endsOn: '31/12/2026',
      frequency: 'monthly',
      installmentsPaid: '0',
      installmentsTotal: '',
      kind: 'recurring',
      lenderName: '',
      name: 'Alquiler',
      nextDueOn: '25/04/2026',
      notes: 'Contrato anual',
      remainingBalance: '',
      status: 'active',
    })

    expect(result.canSubmit).toBe(true)
    expect(result.payload).toEqual({
      amount: 125000,
      categoryId: 'rent',
      dayOfMonth: 25,
      endsOn: '2026-12-31',
      frequency: 'monthly',
      installmentsPaid: 0,
      installmentsTotal: null,
      kind: 'recurring',
      lenderName: null,
      name: 'Alquiler',
      nextDueOn: '2026-04-25',
      notes: 'Contrato anual',
      notifyDaysBefore: null,
      remainingBalance: null,
      status: 'active',
    })
  })

  it('requiere saldo pendiente para una deuda', () => {
    const result = buildFixedExpenseSubmitState({
      amount: '25000',
      categoryId: 'loans',
      endsOn: '',
      frequency: 'monthly',
      installmentsPaid: '0',
      installmentsTotal: '',
      kind: 'debt',
      lenderName: 'Banco',
      name: 'Prestamo',
      nextDueOn: '05/05/2026',
      notes: '',
      remainingBalance: '',
      status: 'active',
    })

    expect(result.canSubmit).toBe(false)
    expect(result.payload).toBeNull()
  })

  it('normaliza cuotas invalidas al construir payload', () => {
    const result = buildFixedExpenseSubmitState({
      amount: '18000',
      categoryId: 'cards',
      endsOn: '',
      frequency: 'monthly',
      installmentsPaid: '-2',
      installmentsTotal: '12',
      kind: 'installment',
      lenderName: '',
      name: 'Heladera',
      nextDueOn: '10/06/2026',
      notes: '',
      remainingBalance: '',
      status: 'active',
    })

    expect(result.canSubmit).toBe(true)
    expect(result.payload?.installmentsPaid).toBe(0)
    expect(result.payload?.installmentsTotal).toBe(12)
  })

  it('arma valores iniciales coherentes para edición y alta rápida', () => {
    const createValues = buildFixedExpenseEditorInitialValues({
      categories: [{ id: 'rent' }],
      defaultKind: 'debt',
      fixedExpense: null,
    })
    const editValues = buildFixedExpenseEditorInitialValues({
      categories: [{ id: 'rent' }],
      defaultKind: 'recurring',
      fixedExpense: {
        amount: 85000,
        category_id: 'cards',
        created_at: '2026-04-01T12:00:00.000Z',
        ends_on: '2026-12-31',
        family_id: 'family-1',
        frequency: 'monthly',
        id: 'fixed-1',
        installments_paid: 2,
        installments_total: 12,
        kind: 'installment',
        last_paid_at: null,
        lender_name: null,
        name: 'Heladera',
        next_due_on: '2026-05-10',
        notes: 'Plan hogar',
        remaining_balance: null,
        status: 'active',
        updated_at: '2026-04-01T12:00:00.000Z',
      },
    })

    expect(createValues.kind).toBe('debt')
    expect(createValues.categoryId).toBe('rent')
    expect(editValues.name).toBe('Heladera')
    expect(editValues.amount).toBe('85000')
    expect(editValues.nextDueOn).toBe('10/05/2026')
    expect(editValues.endsOn).toBe('31/12/2026')
  })
})
