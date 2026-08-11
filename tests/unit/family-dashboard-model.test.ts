import { describe, expect, it } from 'vitest'
import {
  buildFamilyDashboardSnapshot,
  type FamilyDashboardFinanceSnapshot,
} from '@/features/family/family-dashboard-model'
import type { Expense } from '@/features/expenses/use-expenses'
import type { FixedExpense } from '@/features/fixed-expenses/fixed-expense-types'
import { formatLocalDateKey } from '@/utils/pay-cycle'

function buildExpense(overrides: Partial<Expense> = {}): Expense {
  return {
    category_id: 'cat-1',
    commitment_id: null,
    created_at: '2026-04-10T12:00:00.000Z',
    created_by: 'user-1',
    creator_display_name: 'Mario',
    description: 'Compra',
    family_id: 'family-1',
    id: 'expense-1',
    price: 1_000,
    ...overrides,
  }
}

function buildFixedExpense(overrides: Partial<FixedExpense> = {}): FixedExpense {
  return {
    amount: 10_000,
    category_id: null,
    created_at: '2026-01-01T00:00:00.000Z',
    ends_on: null,
    family_id: 'family-1',
    frequency: 'monthly',
    id: 'commitment-1',
    installments_paid: 0,
    installments_total: null,
    kind: 'recurring',
    last_paid_at: null,
    lender_name: null,
    name: 'Alquiler',
    next_due_on: '2026-04-25',
    notes: null,
    remaining_balance: null,
    status: 'active',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

function buildFinance(
  overrides: Partial<FamilyDashboardFinanceSnapshot> = {},
): FamilyDashboardFinanceSnapshot {
  return {
    daily_budget_buffer_mode: 'none',
    daily_budget_buffer_value: 0,
    daily_budget_checkin_hour: 9,
    daily_budget_nudges_enabled: true,
    last_salary_confirmed_at: '2026-04-01T10:00:00.000Z',
    monthly_income: 100_000,
    salary_payment_day: 1,
    savings_goal: 10_000,
    savings_goal_percent: 10,
    usd_exchange_rate: 1_000,
    ...overrides,
  }
}

describe('buildFamilyDashboardSnapshot — variableSpentToday', () => {
  /**
   * El numerador del medidor "podés gastar hoy" del hero. Antes el medidor
   * usaba el promedio del ciclo y la barra quedaba clavada; ver
   * `derive-gauge-state`.
   */
  const today = new Date('2026-04-20T09:00:00.000Z')

  it('suma sólo el gasto VARIABLE de hoy', () => {
    const snapshot = buildFamilyDashboardSnapshot({
      expenses: [
        buildExpense({ created_at: '2026-04-20T13:00:00.000Z', id: 'hoy-1', price: 7_000 }),
        buildExpense({ created_at: '2026-04-20T20:00:00.000Z', id: 'hoy-2', price: 3_000 }),
        buildExpense({ created_at: '2026-04-19T13:00:00.000Z', id: 'ayer', price: 50_000 }),
      ],
      finance: buildFinance(),
      today,
    })
    expect(snapshot.variableSpentToday).toBe(10_000)
    // Y el del ciclo sigue contando todo, para no romper la proyección.
    expect(snapshot.variableSpentInCurrentCycle).toBe(60_000)
  })

  it('deja afuera los pagos de fijos, igual que el bucket del ciclo', () => {
    const snapshot = buildFamilyDashboardSnapshot({
      commitments: [buildFixedExpense()],
      expenses: [
        buildExpense({ created_at: '2026-04-20T13:00:00.000Z', id: 'variable', price: 4_000 }),
        buildExpense({
          commitment_id: 'commitment-1',
          created_at: '2026-04-20T14:00:00.000Z',
          id: 'fijo',
          price: 30_000,
        }),
      ],
      finance: buildFinance(),
      today,
    })
    expect(snapshot.variableSpentToday).toBe(4_000)
  })

  it('sin gastos hoy es 0, no el promedio de nada', () => {
    const snapshot = buildFamilyDashboardSnapshot({
      expenses: [
        buildExpense({ created_at: '2026-04-18T13:00:00.000Z', id: 'viejo', price: 90_000 }),
      ],
      finance: buildFinance(),
      today,
    })
    expect(snapshot.variableSpentToday).toBe(0)
  })
})

describe('buildFamilyDashboardSnapshot', () => {
  it('deriva balance, presión fija e histórico mensual desde una sola colección de gastos', () => {
    const snapshot = buildFamilyDashboardSnapshot({
      commitments: [buildFixedExpense()],
      expenses: [
        buildExpense({ created_at: '2026-04-10T12:00:00.000Z', id: 'expense-variable', price: 15_000 }),
        buildExpense({
          commitment_id: 'commitment-1',
          created_at: '2026-04-12T12:00:00.000Z',
          id: 'expense-commitment',
          price: 5_000,
        }),
        buildExpense({ created_at: '2026-03-08T12:00:00.000Z', id: 'expense-march', price: 20_000 }),
      ],
      finance: buildFinance(),
      today: new Date('2026-04-20T09:00:00.000Z'),
    })

    expect(snapshot.totalGeneral).toBe(40_000)
    expect(snapshot.actualSpentInCurrentCycle).toBe(20_000)
    expect(snapshot.variableSpentInCurrentCycle).toBe(15_000)
    expect(snapshot.commitmentPaymentsInCurrentCycle).toBe(5_000)
    expect(snapshot.commitmentPressureInCurrentCycle).toBe(10_000)
    expect(snapshot.totalAvailable).toBe(65_000)
    expect(snapshot.savingsGoalPercent).toBe(10)
    expect(snapshot.targetEssentialsPercent).toBe(50)
    expect(snapshot.targetFlexiblePercent).toBe(40)
    expect(snapshot.flexibleTargetAmount).toBe(40_000)
    expect(snapshot.flexibleDelta).toBe(-25_000)
    expect(snapshot.flexibleRemaining).toBe(25_000)
    expect(snapshot.monthlyHistory[0]?.spent).toBe(20_000)
    expect(snapshot.monthlyHistory[1]?.spent).toBe(20_000)
    expect(snapshot.monthlyHistoryTotals.totalSpent).toBe(40_000)
  })

  it('con override de saldo: resta TODO el gasto variable del ciclo (no solo el posterior a confirmar)', () => {
    // El override (200k) es un presupuesto BRUTO del ciclo (sueldo/caja +
    // arrastre), NO una foto del saldo al confirmar. TODO el gasto variable del
    // ciclo salió de ahí — el previo a la confirmación también — así que se resta
    // completo (var_cycle), igual que el path sin override. El override solo
    // cambia el ingreso, no el boundary del gasto.
    const snapshot = buildFamilyDashboardSnapshot({
      commitments: [],
      expenses: [
        // 5/4 (antes de confirmar el 10/4) → SÍ se resta (salió del presupuesto).
        buildExpense({ created_at: '2026-04-05T12:00:00.000Z', id: 'pre-confirm', price: 30_000 }),
        // 15/4 (después de confirmar) → SÍ se resta.
        buildExpense({ created_at: '2026-04-15T12:00:00.000Z', id: 'post-confirm', price: 20_000 }),
      ],
      finance: buildFinance({
        monthly_income: 100_000,
        savings_goal: 0,
        savings_goal_percent: 0,
        current_cycle_starting_balance: 200_000,
        current_cycle_anchor: '2026-04-01',
        last_salary_confirmed_at: '2026-04-10T10:00:00.000Z',
      }),
      today: new Date('2026-04-20T09:00:00.000Z'),
    })

    // Gasto variable del ciclo = 50k (30k + 20k), TODO se resta:
    // 200k − 0 ahorro − 0 fijos − 50k = 150k. (El fix viejo var_since_confirm
    // daba 180k porque descartaba los 30k previos a confirmar.)
    expect(snapshot.variableSpentInCurrentCycle).toBe(50_000)
    expect(snapshot.totalAvailable).toBe(150_000)
  })

  it('congela el ciclo cuando falta confirmar el cobro del mes actual', () => {
    const snapshot = buildFamilyDashboardSnapshot({
      expenses: [
        buildExpense({ created_at: '2026-03-20T12:00:00.000Z', id: 'expense-march', price: 8_000 }),
        buildExpense({ created_at: '2026-04-10T12:00:00.000Z', id: 'expense-april', price: 12_000 }),
      ],
      finance: buildFinance({
        last_salary_confirmed_at: '2026-03-02T10:00:00.000Z',
      }),
      today: new Date('2026-04-20T09:00:00.000Z'),
    })

    expect(snapshot.isSalaryPendingConfirmation).toBe(true)
    // Refactor: cycle anchor now starts on the salary day itself (inclusive) instead of day-after.
    expect(formatLocalDateKey(snapshot.payCycle.start)).toBe('2026-03-01')
    expect(formatLocalDateKey(snapshot.payCycle.end)).toBe('2026-04-01')
    // Spec A.5 reframe: `spentInCurrentCycle` ahora vive sobre la ventana
    // mensual de accounting (que NO se congela cuando falta confirmar el
    // sueldo — el plano mensual sigue su curso). Para monthly users, la
    // ventana es el mes actual (abril), no el cycle congelado (marzo).
    // Por eso registramos los $12.000 de abril, no los $8.000 de marzo.
    expect(snapshot.spentInCurrentCycle).toBe(12_000)
    expect(snapshot.remainingUntilPayday).toBeLessThan(0)
  })

  it('detecta cuando el gasto flexible ya superó el objetivo configurado', () => {
    const snapshot = buildFamilyDashboardSnapshot({
      expenses: [
        buildExpense({ created_at: '2026-04-10T12:00:00.000Z', id: 'expense-1', price: 18_000 }),
        buildExpense({ created_at: '2026-04-12T12:00:00.000Z', id: 'expense-2', price: 17_000 }),
      ],
      finance: buildFinance({
        monthly_income: 100_000,
        savings_goal: 25_000,
        savings_goal_percent: 25,
      }),
      today: new Date('2026-04-20T09:00:00.000Z'),
    })

    expect(snapshot.targetFlexiblePercent).toBe(25)
    expect(snapshot.flexibleTargetAmount).toBe(25_000)
    expect(snapshot.flexibleDelta).toBe(10_000)
    expect(snapshot.flexibleRemaining).toBe(0)
  })

  describe('modo ingreso dinámico (income_mode = dynamic)', () => {
    it('expone incomeMode y reparte el cupo sobre los días RESTANTES', () => {
      const snapshot = buildFamilyDashboardSnapshot({
        expenses: [],
        finance: buildFinance({
          monthly_income: 0,
          income_mode: 'dynamic',
          savings_goal: 0,
          savings_goal_percent: 0,
        }),
        today: new Date('2026-04-20T09:00:00.000Z'),
      })

      expect(snapshot.incomeMode).toBe('dynamic')
      // Sin override real no hay cycleStartingBalanceOverride, pero el
      // reparto del cupo usa los días restantes (tratamiento override).
      expect(snapshot.cycleStartingBalanceOverride).toBeNull()
      expect(snapshot.effectiveCycleDays).toBe(
        snapshot.monthlyAccounting.daysRemaining,
      )
      // El ingreso base es 0 — el ciclo se fondea con income_events
      // (entran como cycleExtraIncome en use-home-metrics).
      expect(snapshot.effectiveCycleIncome).toBe(0)
    })

    it('ignora un savings_goal stale (el ahorro por % no aplica en dinámico)', () => {
      // Un fixed→dynamic puede dejar savings_goal > 0 en DB; el modelo
      // lo neutraliza (espejo del `eff_savings = 0 when dyn` del SQL).
      const snapshot = buildFamilyDashboardSnapshot({
        expenses: [],
        finance: buildFinance({
          monthly_income: 0,
          income_mode: 'dynamic',
          savings_goal: 50_000,
          savings_goal_percent: 20,
        }),
        today: new Date('2026-04-20T09:00:00.000Z'),
      })

      expect(snapshot.savingsGoal).toBe(0)
    })

    it('ignora un monthly_income stale (hogar que cambió a dinámico con sueldo cargado)', () => {
      // El switch de Settings no zerea contribuciones (dynamic→fixed las
      // recupera); el modelo fuerza la base a 0 en dinámico para que el
      // sueldo fantasma no infle el presupuesto.
      const snapshot = buildFamilyDashboardSnapshot({
        expenses: [],
        finance: buildFinance({
          monthly_income: 850_000,
          income_mode: 'dynamic',
          savings_goal: 0,
          savings_goal_percent: 0,
        }),
        today: new Date('2026-04-20T09:00:00.000Z'),
      })

      expect(snapshot.monthlyIncome).toBe(0)
      expect(snapshot.effectiveCycleIncome).toBe(0)
    })

    it('NUNCA marca cobro pendiente (exención del freeze en el cliente)', () => {
      // Sin la exención, un dinámico con last_salary_confirmed_at null y
      // salary_payment_day default quedaba pending ~todo el mes → hero
      // con "+N días sin cobrar" y ventana congelada en ciclo mensual.
      const snapshot = buildFamilyDashboardSnapshot({
        expenses: [],
        finance: buildFinance({
          monthly_income: 0,
          income_mode: 'dynamic',
          savings_goal: 0,
          savings_goal_percent: 0,
          last_salary_confirmed_at: null,
          salary_payment_day: 1,
        }),
        today: new Date('2026-04-20T09:00:00.000Z'),
      })

      expect(snapshot.isSalaryPendingConfirmation).toBe(false)
    })

    it('NO auto-abre el prompt de saldo inicial del ciclo', () => {
      const snapshot = buildFamilyDashboardSnapshot({
        expenses: [],
        finance: buildFinance({
          monthly_income: 0,
          income_mode: 'dynamic',
          savings_goal: 0,
          savings_goal_percent: 0,
          // Anchor viejo/ausente: en fixed esto abriría el prompt.
          current_cycle_anchor: null,
          current_cycle_starting_balance: null,
        }),
        today: new Date('2026-04-20T09:00:00.000Z'),
      })

      expect(snapshot.isCycleStartingBalancePromptPending).toBe(false)
    })

    it('fixed conserva el comportamiento previo (regresión)', () => {
      const snapshot = buildFamilyDashboardSnapshot({
        expenses: [],
        finance: buildFinance({ monthly_income: 100_000 }),
        today: new Date('2026-04-20T09:00:00.000Z'),
      })

      expect(snapshot.incomeMode).toBe('fixed')
      expect(snapshot.effectiveCycleDays).toBe(snapshot.monthlyAccounting.days)
      expect(snapshot.isCycleStartingBalancePromptPending).toBe(true)
    })
  })
})
