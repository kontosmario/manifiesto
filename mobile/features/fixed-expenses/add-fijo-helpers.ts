// Helpers + constantes del wizard add-fijo. Extraídos de
// `add-fijo-v2-screen.tsx` para que la screen pueda concentrarse en
// orquestación. Cero side effects: todo puro.
import type { FixedExpenseFrequency } from '@/features/fixed-expenses/fixed-expense-types'

// `cuotas` (UI choice) mappea a `frequency='monthly' + kind='installment'`
// en el backend. El resto mappea 1:1 con la columna `frequency`.
export type FreqChoice = FixedExpenseFrequency | 'cuotas'

export const FREQ_OPTIONS: Array<{ id: FreqChoice; label: string; icon: string }> = [
  { id: 'monthly',    label: 'Mensual',    icon: '🗓' },
  { id: 'biweekly',   label: 'Quincenal',  icon: '🔁' },
  { id: 'weekly',     label: 'Semanal',    icon: '⏰' },
  { id: 'quarterly',  label: 'Trimestral', icon: '🌱' },
  { id: 'semiannual', label: 'Semestral',  icon: '🌗' },
  { id: 'annual',     label: 'Anual',      icon: '🎉' },
  { id: 'cuotas',     label: 'Cuotas',     icon: '💳' },
]

export const CUOTA_OPTIONS = [3, 6, 12, 18, 24, 36] as const

export const QUICK_AMOUNTS = [5000, 15000, 30000, 50000, 100000] as const

/**
 * Convert hex color → rgba string. Usado para tintar surfaces (e.g.
 * el icon container de la summary card o los gradients del calendario)
 * con el color de la categoría sin reventar el contraste del texto.
 */
export function hexAlpha(hex: string, alpha: number): string {
  const normalized = hex.replace('#', '')
  const full =
    normalized.length === 3
      ? normalized.split('').map((c) => c + c).join('')
      : normalized
  const r = parseInt(full.slice(0, 2), 16)
  const g = parseInt(full.slice(2, 4), 16)
  const b = parseInt(full.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

/**
 * Cómputa el `next_due_on` inicial para un fijo recién creado.
 *
 * Antes (2026-05-30): siempre devolvía "próximo `day` futuro", lo cual
 * combinado con que el usuario tocara "Registrar pago" enseguida para
 * marcarlo como "ya pagué", causaba que `next_due_on` saltara DOS
 * meses adelante (form puso mayo, RPC avanzó a junio) — la cuota del
 * mes en curso quedaba "skipeada", invisible para el ciclo.
 *
 * Ahora: SIEMPRE devuelve la ocurrencia de ESTE mes (clampada a la
 * cantidad de días reales del mes — ej: day=31 en febrero → 28/29).
 * El form pasa esta fecha al INSERT. Si el toggle "Ya pagué la cuota
 * más reciente" está activo, el caller dispara después
 * `recordFixedExpensePayment` que avanza correctamente al mes siguiente
 * y crea el payment row para esta cuota. Si está inactivo, el fijo
 * queda con `next_due_on = este mes` → status `pending` (todavía no
 * venció) u `overdue` (ya venció y no se pagó) según el día.
 *
 * Esto elimina el "salto de mes" estructuralmente: el form siempre
 * apunta a la cuota más cercana (la del mes actual), y el "Registrar
 * pago" la mueve al siguiente — coincidiendo con la intención del user.
 */
export function buildNextDueOn(day: number): string {
  const today = new Date()
  const year = today.getUTCFullYear()
  const month = today.getUTCMonth()
  // Clamp al último día válido del mes (ej: feb no tiene 31).
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
  const safeDay = Math.min(day, daysInMonth)
  const due = new Date(Date.UTC(year, month, safeDay))
  return due.toISOString().slice(0, 10)
}
