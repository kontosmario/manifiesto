import { describe, expect, it } from 'vitest'
import { classifyControlMode } from '@/features/insights/control-v2-mode'
import type { FamilyFinance } from '@/features/finance/use-family-finance'

function buildFinance(overrides: Partial<FamilyFinance> = {}): FamilyFinance {
  return {
    daily_budget_buffer_mode: 'none',
    daily_budget_buffer_value: 0,
    daily_budget_checkin_hour: 9,
    daily_budget_nudges_enabled: true,
    monthly_income: 0,
    savings_goal: 0,
    savings_goal_percent: 20,
    usd_exchange_rate: 1,
    salary_payment_day: 1,
    last_salary_confirmed_at: null,
    current_cycle_anchor: null,
    ...overrides,
  } as FamilyFinance
}

describe('classifyControlMode', () => {
  it('returns noConfig=true and usingMock=true when finance is missing', () => {
    expect(classifyControlMode({ finance: undefined, expensesCount: 0 })).toEqual({
      noConfig: true,
      usingMock: true,
    })
  })

  it('returns noConfig=true and usingMock=true when monthly_income is 0', () => {
    expect(
      classifyControlMode({
        finance: buildFinance({ monthly_income: 0 }),
        expensesCount: 0,
      }),
    ).toEqual({ noConfig: true, usingMock: true })
  })

  it('returns noConfig=false but usingMock=true when income is set but no expenses (key case)', () => {
    // User finished onboarding (income > 0) but has not logged any
    // expense yet. CONTROL should render the real cards (cupo diario
    // computable) — not the empty-state — but signals stay empty and
    // asistente keeps the first-time copy.
    expect(
      classifyControlMode({
        finance: buildFinance({ monthly_income: 500_000 }),
        expensesCount: 0,
      }),
    ).toEqual({ noConfig: false, usingMock: true })
  })

  it('returns noConfig=false and usingMock=false for a fully-set-up account', () => {
    expect(
      classifyControlMode({
        finance: buildFinance({ monthly_income: 500_000 }),
        expensesCount: 12,
      }),
    ).toEqual({ noConfig: false, usingMock: false })
  })

  it('treats negative income the same as missing income', () => {
    expect(
      classifyControlMode({
        finance: buildFinance({ monthly_income: -1 }),
        expensesCount: 5,
      }),
    ).toEqual({ noConfig: true, usingMock: true })
  })
})
