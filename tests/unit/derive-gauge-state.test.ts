import { describe, expect, it } from 'vitest'

import {
  GAUGE_LIMIT_THRESHOLD,
  GAUGE_OVER_THRESHOLD,
  computeOpeningDailyBudget,
  deriveGaugeState,
} from '@/features/home/derive-gauge-state'

/**
 * Rama BRUTA del cupo: sueldo fijo sin override. El cupo no sabe nada del
 * gasto, así que el medidor le resta lo de hoy directamente. Es el caso de la
 * gran mayoría de los hogares y el de la cuenta donde el owner reportó el bug.
 */
const bruto = (spentToday: number, dailyBudget: number) =>
  deriveGaugeState({ spentToday, dailyBudget, cupoNetsSpend: false, budgetDays: 30 })

describe('deriveGaugeState — umbrales (owner: ok < 0.85 · limit 0.85–1.0 · over > 1.0)', () => {
  it('exporta las constantes fijadas por el owner', () => {
    expect(GAUGE_LIMIT_THRESHOLD).toBe(0.85)
    expect(GAUGE_OVER_THRESHOLD).toBe(1.0)
  })

  it('caso del mockup: 124k/179k ≈ 0.69 → ok', () => {
    const state = bruto(124_000, 179_000)
    expect(state?.status).toBe('ok')
    expect(state?.fillRatio).toBeCloseTo(124_000 / 179_000, 10)
  })

  it('borde exacto 0.849 → ok', () => {
    expect(bruto(849, 1000)?.status).toBe('ok')
  })

  it('borde exacto 0.85 → limit (inclusive)', () => {
    expect(bruto(850, 1000)?.status).toBe('limit')
  })

  it('borde exacto 1.0 → limit (inclusive)', () => {
    const state = bruto(1000, 1000)
    expect(state?.status).toBe('limit')
    expect(state?.fillRatio).toBe(1)
  })

  it('borde 1.001 → over', () => {
    expect(bruto(1001, 1000)?.status).toBe('over')
  })

  it('gasto 0 → ok con fill 0 y el cupo entero disponible', () => {
    const state = bruto(0, 179_000)
    expect(state).toEqual({
      status: 'ok',
      fillRatio: 0,
      openingBudget: 179_000,
      spentToday: 0,
      remainingToday: 179_000,
    })
  })
})

describe('deriveGaugeState — mide el DÍA, no el promedio del ciclo', () => {
  /**
   * EL bug que reportó el owner, con sus números reales: cupo ~$32.258
   * (1.000.000 / 31, sin fijos ni ahorro), $65.000 gastados en el ciclo de los
   * cuales $50.000 son de hoy, al día 20.
   *
   * Con el promedio del ciclo (65.000/20 = 3.250) el medidor daba 10% y "ok".
   * Con el gasto del día da lo que de verdad está pasando: se pasó.
   */
  it('el caso reportado: $50.000 hoy sobre un cupo de $32.258 → excedido', () => {
    const state = bruto(50_000, 32_258)
    expect(state?.status).toBe('over')
    expect(state?.fillRatio).toBe(1)
    expect(state?.remainingToday).toBe(0)
    // Y para dejar constancia de qué mostraba antes con los mismos datos:
    const conPromedioDelCiclo = bruto(65_000 / 20, 32_258)
    expect(conPromedioDelCiclo?.status).toBe('ok')
    expect(conPromedioDelCiclo?.fillRatio).toBeLessThan(0.11)
  })

  it('un gasto nuevo mueve la barra de verdad', () => {
    const antes = bruto(15_000, 32_258)
    const despues = bruto(65_000, 32_258)
    expect(despues!.fillRatio - antes!.fillRatio).toBeGreaterThan(0.5)
  })
})

describe('deriveGaugeState — la rama donde el cupo YA descontó el gasto', () => {
  /**
   * Con override de saldo o ingreso dinámico, el cupo sale del discrecional,
   * que ya restó el gasto variable del ciclo — el de hoy incluido. Restarlo de
   * nuevo descuenta dos veces el mismo gasto y el hero pasa a contradecir al
   * paso 2 del alta (ver `add-expense-impact`).
   *
   * El medidor mide contra el cupo de APERTURA: se le devuelve la parte del
   * gasto de hoy que ya tenía descontada, que es `gastoHoy / díasRestantes`.
   */
  it('devuelve al cupo la parte del gasto de hoy que ya tenía restada', () => {
    // Cupo visible 10.000 con 10 días restantes y 2.000 gastados hoy: de esos
    // 2.000, 200 por día ya se le habían sacado al cupo.
    const state = deriveGaugeState({
      spentToday: 2_000,
      dailyBudget: 10_000,
      cupoNetsSpend: true,
      budgetDays: 10,
    })
    expect(state?.openingBudget).toBeCloseTo(10_200, 10)
    expect(state?.remainingToday).toBeCloseTo(8_200, 10)
    expect(state?.fillRatio).toBeCloseTo(2_000 / 10_200, 10)
  })

  it('NO duplica el descuento: queda por encima de restar el gasto entero', () => {
    const conGuarda = deriveGaugeState({
      spentToday: 2_000,
      dailyBudget: 10_000,
      cupoNetsSpend: true,
      budgetDays: 10,
    })
    const duplicando = 10_000 - 2_000
    expect(conGuarda!.remainingToday).toBeGreaterThan(duplicando)
  })

  it('en la rama bruta la apertura ES el cupo (no se toca)', () => {
    const state = bruto(2_000, 10_000)
    expect(state?.openingBudget).toBe(10_000)
    expect(state?.remainingToday).toBe(8_000)
  })

  it('último día del ciclo: el gasto de hoy se le había restado entero', () => {
    const state = deriveGaugeState({
      spentToday: 2_000,
      dailyBudget: 10_000,
      cupoNetsSpend: true,
      budgetDays: 1,
    })
    expect(state?.openingBudget).toBe(12_000)
  })
})

describe('computeOpeningDailyBudget — la base compartida con el alta de gasto', () => {
  /**
   * El hero y el "revisá el impacto" del paso 2 tienen que partir de la MISMA
   * base, o muestran cuentas distintas del mismo gasto (lo que reportó el
   * owner). Por eso la apertura se calcula UNA vez y la consumen las dos.
   */
  it('el medidor mide contra exactamente la base que exporta el helper', () => {
    const args = {
      spentToday: 2_000,
      dailyBudget: 10_000,
      cupoNetsSpend: true,
      budgetDays: 10,
    }
    expect(deriveGaugeState(args)?.openingBudget).toBe(computeOpeningDailyBudget(args))
  })

  it('la apertura NO crece cuando el hogar en override se pasa del ciclo', () => {
    /**
     * `dailyBudget` sale de clampear el discrecional a 0 ANTES de dividir, así
     * que una vez que te pasaste vale 0 y no dice por cuánto. Reconstruir la
     * apertura sumándole `spentToday / días` a ese 0 devolvía un objetivo del
     * día que SUBÍA con cada gasto nuevo — la barra decía "GASTADO $130k DE
     * $13k" y al siguiente gasto "DE $18k".
     *
     * Discrecional de apertura 100.000 en 10 días ⇒ la apertura real es
     * 10.000, gastes lo que gastes.
     */
    const days = 10
    for (const spent of [130_000, 180_000, 400_000]) {
      const discretionaryRaw = 100_000 - spent // el crudo YA restó el gasto
      const dailyBudget = Math.max(
        0,
        Math.round(Math.max(0, discretionaryRaw) / days),
      )
      expect(dailyBudget).toBe(0) // el clamp mordió
      expect(
        computeOpeningDailyBudget({
          dailyBudget,
          spentToday: spent,
          cupoNetsSpend: true,
          budgetDays: days,
          discretionaryRaw,
        }),
      ).toBe(10_000)
    }
  })

  it('el medidor NO desaparece el día que te pasaste', () => {
    // Con la guarda vieja (`dailyBudget <= 0` antes de derivar la apertura) el
    // bloque central de la card se ocultaba justo el día que más importa.
    const state = deriveGaugeState({
      spentToday: 130_000,
      dailyBudget: 0,
      cupoNetsSpend: true,
      budgetDays: 10,
      discretionaryRaw: -30_000,
    })
    expect(state).not.toBeNull()
    expect(state!.status).toBe('over')
    expect(state!.openingBudget).toBe(10_000)
    expect(state!.remainingToday).toBe(0)
  })

  it('en la rama bruta la apertura ES el cupo canónico', () => {
    expect(
      computeOpeningDailyBudget({
        spentToday: 50_000,
        dailyBudget: 32_258,
        cupoNetsSpend: false,
        budgetDays: 31,
      }),
    ).toBe(32_258)
  })
})

describe('deriveGaugeState — null guards (el hero oculta el medidor)', () => {
  it('dailyBudget 0 → null', () => {
    expect(bruto(100, 0)).toBeNull()
  })

  it('dailyBudget negativo → null', () => {
    expect(bruto(100, -5)).toBeNull()
  })

  it('datos no finitos → null', () => {
    expect(bruto(Number.NaN, 1000)).toBeNull()
    expect(bruto(100, Number.NaN)).toBeNull()
    expect(bruto(100, Number.POSITIVE_INFINITY)).toBeNull()
    expect(bruto(Number.NEGATIVE_INFINITY, 1000)).toBeNull()
    expect(
      deriveGaugeState({
        spentToday: 100,
        dailyBudget: 1000,
        cupoNetsSpend: true,
        budgetDays: Number.NaN,
      }),
    ).toBeNull()
  })
})

describe('deriveGaugeState — fillRatio clamp 0..1 (el status usa el ratio sin clamp)', () => {
  it('excedido lejos del cupo → fill clampeado a 1', () => {
    const state = bruto(358_000, 179_000)
    expect(state?.status).toBe('over')
    expect(state?.fillRatio).toBe(1)
  })

  it('gasto negativo (defensivo) → fill 0, status ok', () => {
    const state = bruto(-100, 1000)
    expect(state?.status).toBe('ok')
    expect(state?.fillRatio).toBe(0)
    expect(state?.spentToday).toBe(0)
    expect(state?.remainingToday).toBe(1000)
  })
})
