import i18n from '@/lib/i18n'
import type { Onb5dIngresosState } from './onb-5d-ingresos'

/**
 * Formateo compartido del flujo de onboarding del rediseño (Turno 5).
 * Copys/formatos aprobados con las réplicas — el cableado a producción
 * reutiliza estas funciones para no divergir de lo aprobado.
 */

/** "$2.500.000" — separador de miles con punto, sin Intl. */
export function formatPesos(value: number): string {
  return `$${String(Math.round(value)).replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`
}

/** Etiqueta del ciclo para la fila INGRESOS del resumen (5f). */
export function cicloLabel(income: Onb5dIngresosState): string {
  switch (income.cicloTipo) {
    case 'mensual':
      return i18n.t('onboarding:success.cycleMonthly', { day: income.diaCobro ?? 1 })
    case 'quincenal':
      return i18n.t('onboarding:success.cycleBiweekly', { day: income.diaCobro ?? 1 })
    case 'semanal':
      return i18n.t('onboarding:success.cycleWeekly')
    case 'custom':
      return i18n.t('onboarding:success.cycleCustom', { days: income.cicloN })
    default:
      return i18n.t('onboarding:success.cycleMonthlyPlain')
  }
}
