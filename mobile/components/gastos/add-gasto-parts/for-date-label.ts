// Etiqueta legible del día al que se estampa el gasto ("Hoy", "Ayer",
// "martes 12 ago"). Hoy la consume sólo la píldora del back-date —la fila
// FECHA del paso 2 se oculta justamente cuando hay back-date, para no repetir
// lo que la píldora ya dice— pero vive suelta igual: cualquier segunda
// superficie que nombre ese día tiene que decirlo con estas mismas palabras.
//
// Se resuelve en el hilo JS y NUNCA dentro de un worklet: `getDateTimeFormat`
// construye un `Intl.DateTimeFormat`, que crashea sin stack en Reanimated.
import i18n from '@/lib/i18n'
import { getDateTimeFormat } from '@/lib/i18n/active-locale'

const WEEKDAY_LONG_OPTIONS: Intl.DateTimeFormatOptions = { weekday: 'long' }
const MONTH_SHORT_OPTIONS: Intl.DateTimeFormatOptions = { month: 'short' }

export function formatForDateLabel(date: Date): string {
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const diffDays = Math.round((now.getTime() - target.getTime()) / 86_400_000)
  if (diffDays === 0) return i18n.t('gastos:addExpense.wizard.step2.forDateToday')
  // "Ayer" no tiene key propia en el namespace del wizard: se reusa la del
  // alta vieja, que dice exactamente lo mismo y ya está traducida en los dos
  // idiomas.
  if (diffDays === 1) return i18n.t('home:addExpenseDashboard.yesterday')
  const weekday = getDateTimeFormat(WEEKDAY_LONG_OPTIONS).format(date)
  const month = getDateTimeFormat(MONTH_SHORT_OPTIONS).format(date)
  return `${weekday} ${date.getDate()} ${month}`
}
