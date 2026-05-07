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

interface PaydayInput {
  paymentDay: number | null
}

export function daysUntilPayday(input: PaydayInput, today: Date): number | null {
  if (input.paymentDay == null) return null
  const utcToday = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()))
  const thisMonthPayday = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), input.paymentDay))
  let target = thisMonthPayday
  if (thisMonthPayday.getTime() < utcToday.getTime()) {
    target = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, input.paymentDay))
  }
  const diffMs = target.getTime() - utcToday.getTime()
  return Math.round(diffMs / 86_400_000)
}

export interface PaydayCycle {
  lastPayday: Date
  nextPayday: Date
  totalDays: number
  daysElapsed: number
  daysRemaining: number
  progress: number
}

export function getPaydayCycle(input: PaydayInput, today: Date): PaydayCycle | null {
  if (input.paymentDay == null) return null
  const utcToday = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()))
  const thisMonthPayday = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), input.paymentDay))

  let lastPayday: Date
  let nextPayday: Date
  if (thisMonthPayday.getTime() > utcToday.getTime()) {
    nextPayday = thisMonthPayday
    lastPayday = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, input.paymentDay))
  } else {
    lastPayday = thisMonthPayday
    nextPayday = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, input.paymentDay))
  }

  const dayMs = 86_400_000
  const totalDays = Math.max(1, Math.round((nextPayday.getTime() - lastPayday.getTime()) / dayMs))
  const daysElapsed = Math.max(0, Math.round((utcToday.getTime() - lastPayday.getTime()) / dayMs))
  const daysRemaining = Math.max(0, Math.round((nextPayday.getTime() - utcToday.getTime()) / dayMs))
  const progress = Math.min(1, Math.max(0, daysElapsed / totalDays))

  return { lastPayday, nextPayday, totalDays, daysElapsed, daysRemaining, progress }
}

interface PaydayPendingInput {
  paymentDay: number | null
  lastConfirmedAt: string | null
}

export function isPaydayPending(input: PaydayPendingInput, today: Date): boolean {
  if (input.paymentDay == null) return false

  const utcToday = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()))
  const thisMonthPayday = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), input.paymentDay))

  if (thisMonthPayday.getTime() > utcToday.getTime()) {
    return false
  }

  if (!input.lastConfirmedAt) return true

  const lastConfirmedMs = new Date(input.lastConfirmedAt).getTime()
  return lastConfirmedMs < thisMonthPayday.getTime()
}

export function getGreeting(hour: number): string {
  if (hour < 6) return 'Buenas noches'
  if (hour < 13) return 'Buen día'
  if (hour < 20) return 'Buenas tardes'
  return 'Buenas noches'
}

