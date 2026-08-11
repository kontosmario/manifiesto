import { describe, expect, it } from 'vitest'
import { computeAddExpenseImpact } from '@/features/expenses/add-expense-impact'
import { deriveGaugeState } from '@/features/home/derive-gauge-state'

/**
 * El "revisá el impacto" del paso 2 y el medidor de la Home tienen que contar
 * la MISMA historia: lo que el paso 2 promete como "ahora" es exactamente lo
 * que la card va a mostrar una vez que el gasto entre.
 *
 * El owner reportó dos veces que no coincidían, por dos causas distintas:
 *  1. cada pantalla derivaba "lo gastado hoy" de una lista propia;
 *  2. al confirmar, la mutación OPTIMISTA metía el gasto en el "antes" del
 *     paso 2, que encima le volvía a restar el monto — el gasto contado dos
 *     veces.
 *
 * Estos tests fijan el puente entre los dos módulos puros. No pueden ver el
 * cableado (para eso hace falta renderer), pero sí dejan escrito cuál es el
 * contrato y, sobre todo, qué pasa cuando se le pasa un "antes" contaminado.
 */

const CASES = [
  { name: 'día limpio', opening: 32_258, spentBefore: 0, amount: 15_000 },
  { name: 'ya había gastado', opening: 32_258, spentBefore: 15_000, amount: 50_000 },
  { name: 'el gasto lo pasa', opening: 10_000, spentBefore: 8_000, amount: 5_000 },
  { name: 'ya venía pasado', opening: 10_000, spentBefore: 14_000, amount: 1_000 },
  { name: 'monto 0 (sin tipear)', opening: 20_000, spentBefore: 5_000, amount: 0 },
]

describe('el impacto del paso 2 coincide con lo que mostrará la Home', () => {
  for (const c of CASES) {
    it(c.name, () => {
      const impact = computeAddExpenseImpact({
        dailyBudget: c.opening,
        spentToday: c.spentBefore,
        amount: c.amount,
        incomeConfigured: true,
      })
      // La Home, una vez que el gasto entró: el gastado de hoy YA lo incluye.
      const home = deriveGaugeState({
        spentToday: c.spentBefore + c.amount,
        dailyBudget: c.opening,
        cupoNetsSpend: false,
        budgetDays: 31,
      })
      expect(home).not.toBeNull()
      // Lo que el paso 2 promete como "ahora" es lo que la card va a decir.
      expect(impact.budgetAfterClamped).toBe(home!.remainingToday)
      // Y las dos coinciden en si te pasaste.
      expect(impact.exceeds).toBe(home!.status === 'over')
    })
  }

  it('el "antes" ya contaminado por el optimista descuadra las dos pantallas', () => {
    // Falsifica el bug: si al paso 2 le llega un `spentToday` que YA incluye
    // el gasto (lo que hacía la mutación optimista con la pantalla montada),
    // promete menos plata de la que la Home va a mostrar. Ese hueco es el
    // "lo resta dos veces" que reportó el owner.
    const opening = 32_258
    const spentBefore = 15_000
    const amount = 50_000

    const contaminado = computeAddExpenseImpact({
      dailyBudget: opening,
      spentToday: spentBefore + amount, // ← el optimista ya entró
      amount,
      incomeConfigured: true,
    })
    const home = deriveGaugeState({
      spentToday: spentBefore + amount,
      dailyBudget: opening,
      cupoNetsSpend: false,
      budgetDays: 31,
    })

    expect(contaminado.budgetAfter).toBe(opening - spentBefore - amount * 2)
    expect(contaminado.budgetAfter).not.toBe(home!.remainingToday - amount)
  })
})
