import { describe, it, expect } from 'vitest'
import {
  normalizeFinancePayload,
  financeInputToStoragePayload,
  validateFamilyFinanceInput,
  type UpsertFamilyFinanceInput,
} from '@/features/finance/family-finance.model'

function makeInput(
  overrides: Partial<UpsertFamilyFinanceInput> = {},
): UpsertFamilyFinanceInput {
  return {
    dailyBudgetBufferMode: 'none',
    dailyBudgetBufferValue: 0,
    dailyBudgetCheckinHour: 9,
    dailyBudgetNudgesEnabled: true,
    monthlyIncome: 100_000,
    savingsGoal: 20_000,
    savingsGoalPercent: 20,
    usdExchangeRate: 1_000,
    salaryPaymentDay: 1,
    lastSalaryConfirmedAt: null,
    currentCycleStartingBalance: null,
    currentCycleAnchor: null,
    cycleType: 'monthly',
    cycleAnchorDate: null,
    cycleLengthDays: null,
    ...overrides,
  }
}

describe('normalizeFinancePayload — income_mode', () => {
  it("'dynamic' explícito se preserva en lectura", () => {
    expect(
      normalizeFinancePayload({ income_mode: 'dynamic' }).income_mode,
    ).toBe('dynamic')
  })

  it("null → default 'fixed'", () => {
    expect(
      normalizeFinancePayload({ income_mode: null as any }).income_mode,
    ).toBe('fixed')
  })

  it("undefined (key ausente) → default 'fixed'", () => {
    expect(normalizeFinancePayload({}).income_mode).toBe('fixed')
    expect(normalizeFinancePayload(null).income_mode).toBe('fixed')
    expect(normalizeFinancePayload(undefined).income_mode).toBe('fixed')
  })

  it("valor basura → default 'fixed' (lectura siempre resuelta)", () => {
    expect(
      normalizeFinancePayload({ income_mode: 'garbage' as any }).income_mode,
    ).toBe('fixed')
  })
})

describe('financeInputToStoragePayload — income_mode', () => {
  it('input SIN incomeMode → income_mode queda undefined (el upsert lo omite y DB preserva)', () => {
    const payload = financeInputToStoragePayload(makeInput())
    // El código real NO borra la key: la setea a undefined. Supabase
    // descarta las keys undefined al serializar, así que un save de otro
    // campo (sueldo, moneda, etc.) preserva el modo vigente en DB.
    expect(payload.income_mode).toBeUndefined()
    expect(Object.prototype.hasOwnProperty.call(payload, 'income_mode')).toBe(true)
  })

  it("incomeMode 'dynamic' viaja como income_mode 'dynamic'", () => {
    const payload = financeInputToStoragePayload(
      makeInput({ incomeMode: 'dynamic' }),
    )
    expect(payload.income_mode).toBe('dynamic')
  })

  it("incomeMode 'fixed' viaja como income_mode 'fixed'", () => {
    const payload = financeInputToStoragePayload(
      makeInput({ incomeMode: 'fixed' }),
    )
    expect(payload.income_mode).toBe('fixed')
  })
})

describe('validateFamilyFinanceInput — incomeMode', () => {
  it('rechaza (throw) un incomeMode fuera de {fixed, dynamic}', () => {
    expect(() =>
      validateFamilyFinanceInput(makeInput({ incomeMode: 'garbage' as any })),
    ).toThrow(
      'Revisa ingreso, ahorro, colchon, nudges, dolar y dia de cobro antes de guardar.',
    )
  })

  it("acepta 'fixed' y devuelve el storage payload con el modo", () => {
    const payload = validateFamilyFinanceInput(makeInput({ incomeMode: 'fixed' }))
    expect(payload.income_mode).toBe('fixed')
  })

  it("acepta 'dynamic' y devuelve el storage payload con el modo", () => {
    const payload = validateFamilyFinanceInput(
      makeInput({ incomeMode: 'dynamic' }),
    )
    expect(payload.income_mode).toBe('dynamic')
  })

  it('acepta incomeMode omitido (undefined = preservar modo vigente)', () => {
    const payload = validateFamilyFinanceInput(makeInput())
    expect(payload.income_mode).toBeUndefined()
  })
})
