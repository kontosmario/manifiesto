import type { PayCycle } from '@/utils/pay-cycle'
import type { FinanceCycleConfig } from '@/utils/finance-cycle-config'
import { formatDayMonthShort, monthShort, weekdayShort } from '@/utils/date-format'
import i18n from '@/lib/i18n'

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
  if (cycleType === 'biweekly') return i18n.t('common:cycle.biweekly', { range })
  if (cycleType === 'weekly') return i18n.t('common:cycle.weekly', { range })
  return i18n.t('common:cycle.custom', { range, days: cycle.days })
}

/**
 * Summary del config (no del ciclo activo) para mostrar en la fila de
 * Settings como "Ciclo de cobro · <valor>".
 */
export function formatCycleSummary(config: FinanceCycleConfig): string {
  if (config.cycle_type === 'monthly') {
    return i18n.t('common:cycle.summaryMonthly', { day: config.salary_payment_day })
  }
  const [y, m, d] = config.cycle_anchor_date.split('-').map(Number)
  const date = new Date(y, (m ?? 1) - 1, d ?? 1)
  if (config.cycle_type === 'biweekly') {
    return i18n.t('common:cycle.summaryBiweekly', {
      date: `${date.getDate()} ${monthShort(date)}`,
    })
  }
  if (config.cycle_type === 'weekly') {
    return i18n.t('common:cycle.summaryWeekly', {
      date: `${weekdayShort(date)} ${date.getDate()} ${monthShort(date)}`,
    })
  }
  return i18n.t('common:cycle.summaryCustom', { days: config.cycle_length_days })
}
