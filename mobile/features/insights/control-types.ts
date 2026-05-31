import type { DailyBudgetSuggestionTone } from '@/features/expenses/daily-budget-engine'
import type { FamilyDashboard } from '@/hooks/use-family-dashboard'

export const CONTROL_SECTIONS = [
  { label: 'Hoy', value: 'today' },
  { label: 'Plan', value: 'plan' },
  { label: 'Meses', value: 'months' },
] as const

export type ControlSection = (typeof CONTROL_SECTIONS)[number]['value']
export type CommitmentSummary = FamilyDashboard['currentCycleCommitmentSummary']

export interface ControlHeroState {
  detail: string
  eyebrow: string
  title: string
  variant: 'accent' | 'hero'
}

export interface ControlAction {
  detail: string
  title: string
  tone: 'primary' | 'success' | 'warning'
}

export interface ControlMood {
  detail: string
  label: string
  score: number
  tone: 'default' | 'success' | 'warning'
}

export interface MetricDescriptor {
  helper: string
  icon:
    | 'account-balance-wallet'
    | 'calendar-month'
    | 'event-available'
    | 'schedule'
    | 'receipt-long'
    | 'insights'
    | 'lock'
    | 'bolt'
    | 'category'
    | 'repeat'
    | 'weekend'
    | 'account-balance'
    | 'shield'
    | 'speed'
  label: string
  tone: 'default' | 'success' | 'warning'
  value: string
  wide?: boolean
}

// Re-export to keep existing callers happy. Definition moved to
// mobile/utils/percent.ts to break the expenses ↔ insights cycle.
export { formatDeltaPercent } from '@/utils/percent'

export function formatRemainingDays(days: number) {
  if (days <= 0) {
    return 'Hoy'
  }

  if (days === 1) {
    return '1 dia'
  }

  return `${days} dias`
}

export function buildTonePalette(
  isDark: boolean,
  tone: ControlAction['tone'] | DailyBudgetSuggestionTone,
  primaryColor: string,
  successColor: string,
  warningColor: string,
) {
  const accentColor =
    tone === 'success' ? successColor : tone === 'warning' ? warningColor : primaryColor

  if (isDark) {
    return {
      accentColor,
      backgroundColor:
        tone === 'success'
          ? 'rgba(53, 212, 111, 0.1)'
          : tone === 'warning'
            ? 'rgba(243, 186, 87, 0.12)'
            : 'rgba(78, 213, 133, 0.1)',
      borderColor:
        tone === 'success'
          ? 'rgba(53, 212, 111, 0.18)'
          : tone === 'warning'
            ? 'rgba(243, 186, 87, 0.22)'
            : 'rgba(78, 213, 133, 0.18)',
    }
  }

  return {
    accentColor,
    backgroundColor:
      tone === 'success'
        ? 'rgba(48, 209, 88, 0.08)'
        : tone === 'warning'
          ? 'rgba(255, 159, 10, 0.1)'
          : 'rgba(25, 182, 107, 0.08)',
    borderColor:
      tone === 'success'
        ? 'rgba(48, 209, 88, 0.14)'
        : tone === 'warning'
          ? 'rgba(255, 159, 10, 0.18)'
          : 'rgba(25, 182, 107, 0.14)',
  }
}
