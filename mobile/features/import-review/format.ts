import i18n from '@/lib/i18n'
import { formatWeekdayDayMonth } from '@/utils/date-format'
import type { ReviewRowWarning } from './types'

/**
 * Miles con punto y decimales sólo cuando no son `,00`.
 *
 * Propio y no el formatter compartido de money a propósito: aquél aplica
 * `Math.abs()` y se come el signo, y acá el signo lo decide el `kind` de la
 * fila (un ingreso se rinde con `+`), no la magnitud.
 */
export function formatThousands(n: number): string {
  const fixed = Math.abs(n).toFixed(2)
  const [intPart, decPart] = fixed.split('.')
  const withDots = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return decPart === '00' ? withDots : `${withDots},${decPart}`
}

/** `$186.400` — la forma en que el flujo muestra plata. */
export function formatMoney(n: number): string {
  return `$${formatThousands(n)}`
}

/** hoy / ayer / mañana, y si no el día con nombre. */
export function formatRelativeDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!m) return iso
  const target = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const targetMid = new Date(target)
  targetMid.setHours(0, 0, 0, 0)
  const diffDays = Math.round((targetMid.getTime() - today.getTime()) / 86_400_000)
  if (diffDays === 0) return i18n.t('gastos:import.relativeDate.today')
  if (diffDays === -1) return i18n.t('gastos:import.relativeDate.yesterday')
  if (diffDays === 1) return i18n.t('gastos:import.relativeDate.tomorrow')
  return formatWeekdayDayMonth(target)
}

/**
 * Hora local `HH:MM` del instante de una captura de Apple Pay. Es la mitad
 * de la procedencia ("Apple Pay · 14:32"): sin ella el usuario no puede
 * atar la fila a un pago concreto de su día.
 */
export function formatCaptureTime(isoInstant: string): string | null {
  const d = new Date(isoInstant)
  if (Number.isNaN(d.getTime())) return null
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${hh}:${mm}`
}

/**
 * Texto a mostrar para una fila sin descripción. NUNCA se escribe en la
 * fila: la descripción vacía es lo que mantiene la fila inválida. Esto es
 * sólo la etiqueta de lectura de la bandeja y del recibo.
 */
export function displayDescription(description: string): string {
  const trimmed = description.trim()
  return trimmed === '' ? i18n.t('gastos:import.noDescription') : trimmed
}

/**
 * Texto de un aviso de fila. Switch explícito —y no una key armada por
 * string— para que `check-i18n-keys` pueda validarlas: las keys dinámicas
 * se le escapan al guard y se rompen en silencio en runtime.
 */
export function warningLabel(w: ReviewRowWarning): string {
  switch (w) {
    case 'foreign-currency':
      return i18n.t('gastos:import.warning.foreignCurrency')
    case 'swap-ambiguous':
      return i18n.t('gastos:import.warning.swapAmbiguous')
    case 'no-merchant':
      return i18n.t('gastos:import.warning.noMerchant')
    case 'no-date':
      return i18n.t('gastos:import.warning.noDate')
    case 'value-zero':
      return i18n.t('gastos:import.warning.valueZero')
    case 'future-date':
      return i18n.t('gastos:import.warning.futureDate')
    case 'refund':
      return i18n.t('gastos:import.warning.refund')
  }
}
