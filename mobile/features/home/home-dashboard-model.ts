/**
 * Pure derivations used by the Home screen. No React, no side effects.
 */

export type DashboardErrorKind = 'network' | 'server' | 'unknown'

export function classifyDashboardError(error: unknown): DashboardErrorKind {
  if (!error || typeof error !== 'object') return 'unknown'
  const maybe = error as {
    name?: unknown
    message?: unknown
    status?: unknown
    code?: unknown
  }

  if (maybe.name === 'AbortError') return 'network'
  if (error instanceof TypeError) return 'network'
  if (typeof maybe.message === 'string' && /network|fetch|offline/i.test(maybe.message)) {
    return 'network'
  }

  if (typeof maybe.status === 'number' && maybe.status >= 500) return 'server'
  if (typeof maybe.status === 'number' && maybe.status >= 400) return 'server'
  if (typeof maybe.code === 'string' && maybe.code.startsWith('PGRST')) return 'server'

  return 'unknown'
}

import type { PayCycle } from '@/utils/pay-cycle'

const DAY_MS = 86_400_000

/**
 * Días hasta el próximo cobro. Por convención `PayCycle.end` es
 * EXCLUSIVE (medianoche del día post-cycle), o sea es exactamente el
 * inicio del próximo ciclo = la próxima fecha de cobro.
 *
 * Funciona para los 4 tipos de ciclo (monthly/biweekly/weekly/custom)
 * porque `usePayCycle` ya despacha al régimen correcto y devuelve la
 * ventana activa.
 */
export function daysUntilPayday(cycle: PayCycle | null, today: Date): number | null {
  if (!cycle) return null
  const diffMs = cycle.end.getTime() - normalizeMidnight(today).getTime()
  return Math.max(0, Math.round(diffMs / DAY_MS))
}

export interface PaydayCycle {
  lastPayday: Date
  nextPayday: Date
  totalDays: number
  daysElapsed: number
  daysRemaining: number
  progress: number
}

/**
 * Deriva la información del ciclo de cobro a partir de `PayCycle`:
 * `lastPayday = cycle.start`, `nextPayday = cycle.end`, etc. Para
 * monthly esto matchea exactamente la lógica previa; para rolling
 * types (biweekly/weekly/custom) refleja el período activo de N días.
 */
export function getPaydayCycle(cycle: PayCycle | null, today: Date): PaydayCycle | null {
  if (!cycle) return null
  const todayMid = normalizeMidnight(today).getTime()
  const startMs = cycle.start.getTime()
  const endMs = cycle.end.getTime()
  const totalDays = Math.max(1, cycle.days)
  const daysElapsed = Math.max(0, Math.round((todayMid - startMs) / DAY_MS))
  const daysRemaining = Math.max(0, Math.round((endMs - todayMid) / DAY_MS))
  const progress = Math.min(1, Math.max(0, daysElapsed / totalDays))
  return {
    lastPayday: cycle.start,
    nextPayday: cycle.end,
    totalDays,
    daysElapsed,
    daysRemaining,
    progress,
  }
}

interface PaydayPendingInput {
  cycle: PayCycle | null
  lastConfirmedAt: string | null
}

/**
 * `true` cuando el ciclo activo arrancó pero el user todavía no
 * confirmó el cobro. Vale para los 4 tipos: el "payday" del ciclo
 * activo es `cycle.start`. Si `lastConfirmedAt < cycle.start`, todavía
 * no confirmó. Sin cycle → no pending.
 */
export function isPaydayPending(input: PaydayPendingInput, _today: Date): boolean {
  if (!input.cycle) return false
  // `cycle.start` está siempre <= today por construcción de usePayCycle.
  // Si lastConfirmedAt < cycle.start, el ciclo activo arrancó pero el
  // user no confirmó.
  if (!input.lastConfirmedAt) return true
  const lastConfirmedMs = new Date(input.lastConfirmedAt).getTime()
  return lastConfirmedMs < input.cycle.start.getTime()
}

function normalizeMidnight(date: Date): Date {
  // Usar UTC para evitar drift de DST entre máquinas y matchear el
  // comportamiento previo (que trabajaba con UTC midnight).
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
}

export function getGreeting(hour: number): string {
  if (hour < 6) return 'Buenas noches'
  if (hour < 13) return 'Buen día'
  if (hour < 20) return 'Buenas tardes'
  return 'Buenas noches'
}

/** Tope de caracteres del nombre mostrado en el saludo del Home. Es la
 *  guardia semántica; el componente además aplica adjustsFontSizeToFit. */
export const GREETING_NAME_MAX_CHARS = 22

/**
 * Acota un `display_name` arbitrario al nombre que se muestra en el título
 * del Home ("Hola, {nombre}") para que no rompa el layout con nombres
 * largos o compuestos:
 *
 *  - colapsa whitespace + trimea
 *  - conserva los primeros DOS tokens → mantiene nombres compuestos
 *    ("Juan Cruz", "Octavio Benjamín") intactos, pero descarta los
 *    apellidos de un nombre legal largo ("Octavio Benjamín Pérez García"
 *    → "Octavio Benjamín")
 *  - guardia final por largo: si aún así es demasiado (un único token
 *    gigante), trunca con elipsis
 *
 * El componente usa esto como primera línea de defensa (semántica) y el
 * auto-shrink (adjustsFontSizeToFit) como segunda (visual). El nombre
 * completo se preserva siempre en el accessibilityLabel.
 */
export function getGreetingName(displayName?: string | null): string {
  const cleaned = (displayName ?? '').replace(/\s+/g, ' ').trim()
  if (!cleaned) return 'Usuario'
  const givenNames = cleaned.split(' ').slice(0, 2).join(' ')
  if (givenNames.length <= GREETING_NAME_MAX_CHARS) return givenNames
  return `${givenNames.slice(0, GREETING_NAME_MAX_CHARS - 1).trimEnd()}…`
}

