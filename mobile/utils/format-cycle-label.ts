import type { PayCycle } from '@/utils/pay-cycle'
import type { FinanceCycleConfig } from '@/utils/finance-cycle-config'
import { formatDayMonthShort, monthShort, weekdayShort } from '@/utils/date-format'

/**
 * Label del ciclo activo para mostrar en hero de Home / Gastos / Fijos.
 * Convención de la app: `end` es exclusive (medianoche del día siguiente
 * al último del ciclo), por eso el label muestra `end - 1d`.
 */
export function formatCycleLabel(
  cycle: PayCycle,
  cycleType: FinanceCycleConfig['cycle_type'],
): string {
  const lastDay = new Date(cycle.end)
  lastDay.setDate(lastDay.getDate() - 1)
  const range = `${formatDayMonthShort(cycle.start)} → ${formatDayMonthShort(lastDay)}`
  if (cycleType === 'monthly') return range
  if (cycleType === 'biweekly') return `${range} · quincena`
  if (cycleType === 'weekly') return `${range} · semana`
  return `${range} · cada ${cycle.days} días`
}

/**
 * Summary del config (no del ciclo activo) para mostrar en la fila de
 * Settings como "Ciclo de cobro · <valor>".
 */
export function formatCycleSummary(config: FinanceCycleConfig): string {
  if (config.cycle_type === 'monthly') {
    return `Mensual · día ${config.salary_payment_day}`
  }
  const [y, m, d] = config.cycle_anchor_date.split('-').map(Number)
  const date = new Date(y, (m ?? 1) - 1, d ?? 1)
  if (config.cycle_type === 'biweekly') {
    return `Quincenal · desde ${date.getDate()} ${monthShort(date)}`
  }
  if (config.cycle_type === 'weekly') {
    return `Semanal · desde ${weekdayShort(date)} ${date.getDate()} ${monthShort(date)}`
  }
  return `Custom · cada ${config.cycle_length_days} días`
}
