import { describe, it, expect } from 'vitest'
import {
  getCurrentPayCycle,
  getCycleExtensionDays,
  isCycleExtended,
} from '@/utils/pay-cycle'
import type { FinanceCycleConfig } from '@/utils/finance-cycle-config'

const monthly = (day: number): FinanceCycleConfig => ({
  cycle_type: 'monthly',
  salary_payment_day: day,
})

/**
 * Ventana ESTIRADA (`cycle_model='extended'` + cobro sin confirmar).
 *
 * El bug que estos tests fijan (QA del owner 2026-08-13): el cliente sólo
 * transportaba el fin REAL de la ventana, así que cada superficie elegía
 * uno y quedaban enfrentadas — el calendario mostraba "el ciclo cerró el
 * 13" (el fin estirado) mientras Fijos y Ajustes decían "día 5" (el
 * payday configurado). `nominalEnd` transporta el segundo.
 */
describe('computePayCycle — ventana extendida', () => {
  const extended = { cycleModel: 'extended' as const, currentCycleAnchor: null }

  it('con el cobro sin confirmar la ventana se estira pero conserva el fin NOMINAL', () => {
    // Payday 5, hoy 13-ago: el ciclo arrancó el 5-jul y se estiró.
    const cycle = getCurrentPayCycle(new Date(2026, 7, 13), monthly(5), true, extended)

    // fin REAL: hoy + 1 (exclusivo)
    expect(cycle.end.getMonth()).toBe(7)
    expect(cycle.end.getDate()).toBe(14)
    // fin NOMINAL: el payday configurado — el "día 5" que ve el owner
    expect(cycle.nominalEnd?.getMonth()).toBe(7)
    expect(cycle.nominalEnd?.getDate()).toBe(5)

    expect(isCycleExtended(cycle)).toBe(true)
    expect(getCycleExtensionDays(cycle)).toBe(9)
  })

  it('la ventana estirada dura MÁS de un mes → el día-de-mes se repite', () => {
    // Esto es lo que rompía la grilla del calendario: indexada por
    // día-de-mes, los días 5..13 existían en julio Y en agosto.
    const cycle = getCurrentPayCycle(new Date(2026, 7, 13), monthly(5), true, extended)
    expect(cycle.days).toBeGreaterThan(31)

    const vistos = new Map<number, number>()
    for (let i = 0; i < cycle.days; i++) {
      const d = new Date(
        cycle.start.getFullYear(),
        cycle.start.getMonth(),
        cycle.start.getDate() + i,
      )
      vistos.set(d.getDate(), (vistos.get(d.getDate()) ?? 0) + 1)
    }
    const repetidos = [...vistos.entries()].filter(([, n]) => n > 1)
    expect(repetidos.length).toBeGreaterThan(0)
  })

  it('con el cobro CONFIRMADO no hay extensión', () => {
    const cycle = getCurrentPayCycle(new Date(2026, 7, 13), monthly(5), false, extended)
    expect(isCycleExtended(cycle)).toBe(false)
    expect(getCycleExtensionDays(cycle)).toBe(0)
    expect(cycle.nominalEnd?.getTime()).toBe(cycle.end.getTime())
  })
})

describe('computePayCycle — modelo NOMINAL sin cambios', () => {
  it('nominalEnd == end: nada que marcar como prórroga', () => {
    for (const pending of [true, false]) {
      const cycle = getCurrentPayCycle(new Date(2026, 7, 13), monthly(5), pending)
      expect(cycle.nominalEnd?.getTime()).toBe(cycle.end.getTime())
      expect(isCycleExtended(cycle)).toBe(false)
      expect(getCycleExtensionDays(cycle)).toBe(0)
    }
  })

  it('la ventana nominal NUNCA repite día-de-mes (el invariante de la grilla)', () => {
    for (let payday = 1; payday <= 28; payday++) {
      const cycle = getCurrentPayCycle(new Date(2026, 7, 13), monthly(payday), false)
      const vistos = new Set<number>()
      for (let i = 0; i < cycle.days; i++) {
        const d = new Date(
          cycle.start.getFullYear(),
          cycle.start.getMonth(),
          cycle.start.getDate() + i,
        )
        expect(vistos.has(d.getDate())).toBe(false)
        vistos.add(d.getDate())
      }
    }
  })
})
