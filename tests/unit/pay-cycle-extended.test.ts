import { describe, expect, it } from 'vitest'
import {
  financeToExtendedCycleContext,
  getCurrentPayCycle,
  type ExtendedCycleContext,
} from '@/utils/pay-cycle'

const D = (y: number, m: number, d: number) => new Date(y, m - 1, d)
const MONTHLY_20 = { cycle_type: 'monthly', salary_payment_day: 20 } as const

const nominal: ExtendedCycleContext = { cycleModel: 'nominal', currentCycleAnchor: null }
const extended = (anchor: string | null): ExtendedCycleContext => ({
  cycleModel: 'extended',
  currentCycleAnchor: anchor,
})

/**
 * Caso real del doc PRE-DEPLOY-V2-CICLO-EXTENDIDO §1: payday 20, el cobro de
 * julio no se confirma, y el 23-jul se carga un gasto ("Cochera", 110.000).
 * En modelo nominal ese gasto queda en limbo; en extendido cae dentro del
 * ciclo que se está estirando.
 */
describe('ciclo extendido — cobro pendiente', () => {
  it('nominal congela la ventana en el payday (el gasto posterior queda afuera)', () => {
    const cycle = getCurrentPayCycle(D(2026, 7, 23), MONTHLY_20, true, nominal)
    expect(cycle.start).toEqual(D(2026, 6, 20))
    expect(cycle.end).toEqual(D(2026, 7, 20))
    // El 23-jul NO cae dentro.
    expect(D(2026, 7, 23) < cycle.end).toBe(false)
  })

  it('extendido estira la ventana hasta hoy inclusive (el gasto entra)', () => {
    const cycle = getCurrentPayCycle(D(2026, 7, 23), MONTHLY_20, true, extended('2026-06-20'))
    expect(cycle.start).toEqual(D(2026, 6, 20))
    expect(cycle.end).toEqual(D(2026, 7, 24)) // hoy + 1
    expect(D(2026, 7, 23) >= cycle.start && D(2026, 7, 23) < cycle.end).toBe(true)
    expect(cycle.days).toBe(34)
  })

  it('extendido arranca en el anchor (confirmación anterior), no en el payday', () => {
    // El cobro anterior se confirmó tarde, el 25-jun.
    const cycle = getCurrentPayCycle(D(2026, 7, 28), MONTHLY_20, true, extended('2026-06-25'))
    expect(cycle.start).toEqual(D(2026, 6, 25))
    expect(cycle.end).toEqual(D(2026, 7, 29))
  })

  it('anchor incoherente con el mes → cae al payday anterior (falla cerrado)', () => {
    const cycle = getCurrentPayCycle(D(2026, 7, 23), MONTHLY_20, true, extended('2020-01-01'))
    expect(cycle.start).toEqual(D(2026, 6, 20))
  })

  it('anchor nulo o basura → misma ventana que sin anchor', () => {
    const sinAnchor = getCurrentPayCycle(D(2026, 7, 23), MONTHLY_20, true, extended(null))
    const basura = getCurrentPayCycle(D(2026, 7, 23), MONTHLY_20, true, extended('no-es-fecha'))
    expect(sinAnchor.start).toEqual(D(2026, 6, 20))
    expect(basura.start).toEqual(D(2026, 6, 20))
  })
})

describe('ciclo extendido — cobro confirmado', () => {
  it('el ciclo nuevo arranca en la FECHA DE CONFIRMACIÓN, no en el payday', () => {
    // Confirmó el 28-jul; el ciclo nuevo va [28-jul → 20-ago).
    const cycle = getCurrentPayCycle(D(2026, 8, 2), MONTHLY_20, false, extended('2026-07-28'))
    expect(cycle.start).toEqual(D(2026, 7, 28))
    expect(cycle.end).toEqual(D(2026, 8, 20))
    expect(cycle.days).toBe(23)
  })

  it('el cupo diario sube en el ciclo corto que sigue a una extensión', () => {
    const normal = getCurrentPayCycle(D(2026, 8, 2), MONTHLY_20, false, nominal)
    const corto = getCurrentPayCycle(D(2026, 8, 2), MONTHLY_20, false, extended('2026-07-28'))
    // Mismo sueldo repartido en menos días → cupo mayor (doc §2).
    expect(corto.days).toBeLessThan(normal.days)
  })

  it('anchor fuera de la ventana vigente → payday nominal', () => {
    const cycle = getCurrentPayCycle(D(2026, 8, 2), MONTHLY_20, false, extended('2026-05-03'))
    expect(cycle.start).toEqual(D(2026, 7, 20))
  })
})

describe('contigüidad — sin huecos ni solapamientos', () => {
  it('el fin del ciclo estirado es el arranque del siguiente', () => {
    // 28-jul: último día de la extensión (aún sin confirmar).
    const estirado = getCurrentPayCycle(D(2026, 7, 28), MONTHLY_20, true, extended('2026-06-20'))
    // Confirma ese mismo día → el ciclo nuevo ancla en 28-jul.
    const nuevo = getCurrentPayCycle(D(2026, 7, 28), MONTHLY_20, false, extended('2026-07-28'))
    expect(nuevo.start).toEqual(D(2026, 7, 28))
    // El estirado termina el 29 (hoy+1) y el nuevo arranca el 28: el día de la
    // confirmación pertenece al ciclo NUEVO. El servidor cierra con
    // period_end = anchor = 28-jul, o sea la misma frontera exacta.
    expect(estirado.start).toEqual(D(2026, 6, 20))
    expect(nuevo.end).toEqual(D(2026, 8, 20))
  })
})

describe('modelo nominal intacto', () => {
  it('sin contexto extendido el resultado es idéntico al de siempre', () => {
    const sinContexto = getCurrentPayCycle(D(2026, 7, 23), MONTHLY_20, true)
    const conNominal = getCurrentPayCycle(D(2026, 7, 23), MONTHLY_20, true, nominal)
    expect(conNominal).toEqual(sinContexto)
  })

  it('el modelo extendido no toca los regímenes rolling', () => {
    const config = {
      cycle_type: 'weekly',
      cycle_anchor_date: '2026-07-06',
      cycle_length_days: 7,
    } as const
    const conExtendido = getCurrentPayCycle(D(2026, 7, 23), config, true, extended('2026-07-01'))
    const sinExtendido = getCurrentPayCycle(D(2026, 7, 23), config, true)
    expect(conExtendido).toEqual(sinExtendido)
  })
})

describe('financeToExtendedCycleContext', () => {
  it('solo el literal "extended" activa el modelo', () => {
    expect(financeToExtendedCycleContext({ cycle_model: 'extended' }).cycleModel).toBe('extended')
    expect(financeToExtendedCycleContext({ cycle_model: 'nominal' }).cycleModel).toBe('nominal')
    expect(financeToExtendedCycleContext({ cycle_model: null }).cycleModel).toBe('nominal')
    expect(financeToExtendedCycleContext(null).cycleModel).toBe('nominal')
    expect(financeToExtendedCycleContext(undefined).cycleModel).toBe('nominal')
    // Columna ausente en una base sin la migración.
    expect(financeToExtendedCycleContext({}).cycleModel).toBe('nominal')
  })

  it('propaga el anchor tal cual', () => {
    expect(
      financeToExtendedCycleContext({ cycle_model: 'extended', current_cycle_anchor: '2026-07-28' })
        .currentCycleAnchor,
    ).toBe('2026-07-28')
  })
})
