import type { FinanceCycleConfig } from '@/utils/finance-cycle-config'
import { getCurrentPayCycle, normalizeToStartOfDay } from '@/utils/pay-cycle'
import { DAY_MS } from '@/utils/time'

/**
 * Ventana mensual de accounting — el plano en el que viven saldo,
 * cupo diario, fijos windowing, proyección de cierre. Paralela al
 * PayCycle (que solo gobierna countdown y confirmar-cobro).
 *
 * Spec: docs/superpowers/specs/2026-06-05-monthly-accounting-reframe-design.md
 */
export interface MonthlyAccountingWindow {
  /** Inicio del mes accounting (inclusive). */
  start: Date
  /** Primer día del próximo mes accounting (exclusive). */
  end: Date
  /** Días en este mes (28-31). */
  days: number
  today: Date
  /** 1-indexed: 1 = primer día del mes. */
  daysIntoMonth: number
  /** Incluye hoy: 1 = "es el último día". */
  daysRemaining: number
}

/**
 * Para monthly users la accounting window === salary cycle (cero
 * regresión vs hoy). Para non-monthly users, es el mes calendario.
 *
 * EXCEPCIÓN — modo INGRESO DINÁMICO (`followCycleWindow`): el usuario
 * eligió su ciclo (semana / quincena / mes) justamente para saber
 * "cómo me fue este ciclo" → la ventana de accounting SIGUE el ciclo
 * rolling elegido, no el mes calendario. Los sueldos fijos weekly/
 * biweekly existentes NO cambian (siguen en mes calendario, decisión
 * de la spec 2026-06-05) — por eso es un flag y no un cambio global.
 */
export function computeMonthlyAccountingWindow(
  cycleConfig: FinanceCycleConfig,
  today: Date,
  freezeUntilSalaryConfirmation = false,
  followCycleWindow = false,
): MonthlyAccountingWindow {
  const todayNorm = normalizeToStartOfDay(today)
  if (followCycleWindow && cycleConfig.cycle_type !== 'monthly') {
    // Ciclo rolling elegido por el usuario dinámico: la ventana ES el
    // ciclo (getCurrentPayCycle ya computa la ventana rolling desde
    // anchor + length; probado por los sueldos weekly existentes).
    const cycle = getCurrentPayCycle(todayNorm, cycleConfig, false)
    const daysIntoMonth =
      Math.floor((todayNorm.getTime() - cycle.start.getTime()) / DAY_MS) + 1
    const daysRemaining = Math.max(
      1,
      Math.ceil((cycle.end.getTime() - todayNorm.getTime()) / DAY_MS),
    )
    return {
      start: cycle.start,
      end: cycle.end,
      days: cycle.days,
      today: todayNorm,
      daysIntoMonth,
      daysRemaining,
    }
  }
  if (cycleConfig.cycle_type === 'monthly') {
    // Mismo freeze que el pay cycle: si el cobro del mes no fue confirmado, la
    // ventana de accounting se queda en el ciclo anterior → el saldo NO salta al
    // ingreso nuevo hasta confirmar el cobro.
    const cycle = getCurrentPayCycle(todayNorm, cycleConfig, freezeUntilSalaryConfirmation)
    const daysIntoMonth = Math.floor((todayNorm.getTime() - cycle.start.getTime()) / DAY_MS) + 1
    const daysRemaining = Math.max(1, Math.ceil((cycle.end.getTime() - todayNorm.getTime()) / DAY_MS))
    return {
      start: cycle.start,
      end: cycle.end,
      days: cycle.days,
      today: todayNorm,
      daysIntoMonth,
      daysRemaining,
    }
  }
  const start = new Date(todayNorm.getFullYear(), todayNorm.getMonth(), 1)
  const end = new Date(todayNorm.getFullYear(), todayNorm.getMonth() + 1, 1)
  const days = Math.round((end.getTime() - start.getTime()) / DAY_MS)
  const daysIntoMonth = todayNorm.getDate()
  const daysRemaining = days - daysIntoMonth + 1
  return { start, end, days, today: todayNorm, daysIntoMonth, daysRemaining }
}
