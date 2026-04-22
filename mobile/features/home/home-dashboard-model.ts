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

interface DashboardSnapshotLike {
  totalAvailable?: number
  savingsRemaining?: number
  fixedExpensesMonthlyTotal?: number
  monthlyIncome?: number
  savingsGoal?: number
}

export interface HomeMetrics {
  availableToday: number
  savedAmount: number
  fixedAmount: number
  projectedMargin: number
}

export function buildHomeMetrics(snapshot: DashboardSnapshotLike): HomeMetrics {
  const availableToday = snapshot.totalAvailable ?? 0
  const savedAmount = snapshot.savingsRemaining ?? 0
  const fixedAmount = snapshot.fixedExpensesMonthlyTotal ?? 0
  const projectedMargin = availableToday - (snapshot.savingsGoal ?? 0)
  return { availableToday, savedAmount, fixedAmount, projectedMargin }
}
