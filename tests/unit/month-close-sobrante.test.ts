import { describe, expect, it } from 'vitest'
import {
  computeSobranteFromSummary,
  SOBRANTE_THRESHOLD,
} from '@/features/month-close/sobrante'

// Regresión de la auditoría 2026-06-11: la fórmula del sobrante
// restaba `savings_delta`, pero el server define
// `savings_delta = max(0, income − total_spent)` — el sobrante mismo.
// La doble resta daba 0 idéntico y la decisión de cierre de mes no se
// disparó NUNCA para ninguna familia (caso real: Abril 2026 de la
// cuenta owner, $1.727.195 sin decisión registrada).

describe('sobrante decidible del cierre de mes (auditoría 2026-06-11)', () => {
  it('caso real Abril 2026: el sobrante es income − spent − goal, no 0', () => {
    // Row real de monthly_summaries (PostgREST devuelve numeric como string).
    const sobrante = computeSobranteFromSummary({
      monthly_income: '6400000.00',
      total_spent: '4672805.00',
      savings_goal_amount: '0.00',
    })
    expect(sobrante).toBe(1_727_195)
    expect(sobrante).toBeGreaterThanOrEqual(SOBRANTE_THRESHOLD)
  })

  it('la meta de ahorro comprometida NO es plata a decidir', () => {
    expect(
      computeSobranteFromSummary({
        monthly_income: 1_000_000,
        total_spent: 700_000,
        savings_goal_amount: 200_000,
      }),
    ).toBe(100_000)
  })

  it('mes pasado de presupuesto: clampea a 0 (nada que decidir)', () => {
    expect(
      computeSobranteFromSummary({
        monthly_income: 1_000_000,
        total_spent: 1_200_000,
        savings_goal_amount: 0,
      }),
    ).toBe(0)
  })

  it('campos faltantes se tratan como 0', () => {
    expect(computeSobranteFromSummary({})).toBe(0)
    expect(
      computeSobranteFromSummary({ monthly_income: 5_000, total_spent: null }),
    ).toBe(5_000)
  })
})
