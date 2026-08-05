import { describe, expect, it } from 'vitest'
import { computeAddExpenseImpact } from '@/features/expenses/add-expense-impact'
import { computeCycleDisponible } from '@/features/family/cycle-disponible'

describe('computeAddExpenseImpact — caso normal', () => {
  it('resta el gasto al cupo libre de hoy y mueve el porcentaje', () => {
    const impact = computeAddExpenseImpact({
      dailyBudget: 10_000,
      spentToday: 3_000,
      amount: 1_500,
      incomeConfigured: true,
    })
    expect(impact.hasBudgetBase).toBe(true)
    expect(impact.budgetBefore).toBe(7_000)
    expect(impact.budgetAfter).toBe(5_500)
    expect(impact.usedPctBefore).toBe(30)
    expect(impact.usedPctAfter).toBe(45)
    expect(impact.deltaPct).toBe(15)
    expect(impact.exceeds).toBe(false)
    expect(impact.overBy).toBe(0)
  })

  it('sin monto todavía cargado, el antes y el después coinciden', () => {
    const impact = computeAddExpenseImpact({
      dailyBudget: 10_000,
      spentToday: 2_000,
      amount: 0,
      incomeConfigured: true,
    })
    expect(impact.budgetBefore).toBe(8_000)
    expect(impact.budgetAfter).toBe(8_000)
    expect(impact.deltaPct).toBe(0)
  })

  it('el delta es consistente con los porcentajes redondeados que se muestran', () => {
    const impact = computeAddExpenseImpact({
      dailyBudget: 3_000,
      spentToday: 1_000,
      amount: 1_000,
      incomeConfigured: true,
    })
    // 33,33% → 66,66% redondean a 33 y 67; el delta tiene que ser 34, no 33.
    expect(impact.usedPctBefore).toBe(33)
    expect(impact.usedPctAfter).toBe(67)
    expect(impact.deltaPct).toBe(impact.usedPctAfter! - impact.usedPctBefore!)
  })
})

describe('computeAddExpenseImpact — el gasto se pasa del cupo', () => {
  it('deja el cupo en negativo y reporta cuánto se pasa', () => {
    const impact = computeAddExpenseImpact({
      dailyBudget: 10_000,
      spentToday: 8_000,
      amount: 5_000,
      incomeConfigured: true,
    })
    expect(impact.budgetBefore).toBe(2_000)
    expect(impact.budgetAfter).toBe(-3_000)
    expect(impact.budgetAfterClamped).toBe(0)
    expect(impact.exceeds).toBe(true)
    expect(impact.overBy).toBe(3_000)
    expect(impact.usedPctAfter).toBe(130)
  })

  it('el cupo libre nunca arranca negativo aunque ya se haya excedido hoy', () => {
    const impact = computeAddExpenseImpact({
      dailyBudget: 10_000,
      spentToday: 14_000,
      amount: 1_000,
      incomeConfigured: true,
    })
    expect(impact.budgetBefore).toBe(0)
    expect(impact.usedPctBefore).toBe(140)
    expect(impact.budgetAfter).toBe(-5_000)
    expect(impact.exceeds).toBe(true)
  })
})

describe('computeAddExpenseImpact — cupo 0', () => {
  it('sin cupo no hay base: porcentajes en null y sin "te pasaste"', () => {
    // Ingreso configurado pero fijos + ahorro se comen todo el mes: el cupo
    // canónico da 0. La card muestra el estado sin-base, no "0% → ∞%".
    const impact = computeAddExpenseImpact({
      dailyBudget: 0,
      spentToday: 0,
      amount: 4_000,
      incomeConfigured: true,
    })
    expect(impact.hasBudgetBase).toBe(false)
    expect(impact.usedPctBefore).toBeNull()
    expect(impact.usedPctAfter).toBeNull()
    expect(impact.deltaPct).toBeNull()
    expect(impact.exceeds).toBe(false)
    expect(impact.overBy).toBe(0)
    expect(impact.budgetBefore).toBe(0)
  })
})

describe('computeAddExpenseImpact — sin ingreso configurado', () => {
  it('no compara contra nada aunque llegue un cupo residual', () => {
    const impact = computeAddExpenseImpact({
      dailyBudget: 1_200,
      spentToday: 0,
      amount: 900,
      incomeConfigured: false,
    })
    expect(impact.hasBudgetBase).toBe(false)
    expect(impact.usedPctAfter).toBeNull()
    expect(impact.exceeds).toBe(false)
  })
})

describe('computeAddExpenseImpact — entradas rotas', () => {
  it('trata NaN e infinitos como 0 en vez de propagarlos a la card', () => {
    const impact = computeAddExpenseImpact({
      dailyBudget: Number.NaN,
      spentToday: Number.POSITIVE_INFINITY,
      amount: Number.NaN,
      incomeConfigured: true,
    })
    expect(impact.hasBudgetBase).toBe(false)
    expect(impact.budgetBefore).toBe(0)
    expect(impact.budgetAfter).toBe(0)
  })

  it('no emite -0 en el cupo restante', () => {
    const impact = computeAddExpenseImpact({
      dailyBudget: 10_000,
      spentToday: 0,
      amount: 10_000.2,
      incomeConfigured: true,
    })
    expect(Object.is(impact.budgetAfter, -0)).toBe(false)
    expect(impact.budgetAfter).toBe(0)
  })
})

describe('computeAddExpenseImpact — se ancla al cupo CANÓNICO', () => {
  it('consume el `dailyBudget` de computeCycleDisponible sin recalcularlo', () => {
    // El impacto no tiene fórmula propia de cupo: lo que entra es exactamente
    // lo que el hero del Home muestra (y lo que espeja el SQL cycle_disponible).
    const disponible = computeCycleDisponible({
      effectiveCycleIncome: 900_000,
      effectiveCycleDays: 30,
      commitmentPressure: 300_000,
      effectiveSavingsGoal: 0,
      totalAvailable: 500_000,
      cycleExtraIncome: 0,
      effectiveReservedFixed: 0,
      hasCycleOverride: false,
    })
    expect(disponible.dailyBudget).toBe(20_000)

    const impact = computeAddExpenseImpact({
      dailyBudget: disponible.dailyBudget,
      spentToday: 5_000,
      amount: 5_000,
      incomeConfigured: true,
    })
    expect(impact.budgetBefore).toBe(15_000)
    expect(impact.budgetAfter).toBe(10_000)
    expect(impact.usedPctAfter).toBe(50)
  })
})
