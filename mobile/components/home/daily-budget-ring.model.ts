import { withAlpha } from '@/theme/color-utils'
import type { DailyBudgetStatus } from '@/features/expenses/daily-budget-engine'
import type { AppTheme } from '@/theme/palette'
import { currencyFormatter } from '@/utils/money'

export interface DailyBudgetRingPalette {
  overrunColor: string
  trackColor: string
  valueColor: string
}

export interface DailyBudgetRingViewModel {
  centerLabel: string
  chartSize: number
  footnote: string
  innerRadius: number
  mainProgress: number
  overrunProgress: number
  palette: DailyBudgetRingPalette
  radius: number
  ringWidth: number
}

export function clamp(value: number, min = 0, max = 1) {
  return Math.max(min, Math.min(value, max))
}

export function getDailyBudgetStatusPalette(
  theme: AppTheme,
  status: DailyBudgetStatus,
): DailyBudgetRingPalette {
  if (status === 'exceeded') {
    return {
      overrunColor: withAlpha(theme.colors.text, theme.isDark ? 0.34 : 0.18),
      trackColor: theme.colors.danger,
      valueColor: theme.colors.danger,
    }
  }

  if (status === 'critical') {
    return {
      overrunColor: 'transparent',
      trackColor: theme.colors.warning,
      valueColor: theme.colors.warning,
    }
  }

  return {
    overrunColor: 'transparent',
    trackColor: theme.colors.primary,
    valueColor: theme.colors.primary,
  }
}

export function buildDailyBudgetRingViewModel({
  compact,
  openingBudget,
  projectedTomorrowOpening,
  remainingRatio,
  remainingToday,
  status,
  theme,
  visibleProgress,
}: {
  compact: boolean
  openingBudget: number
  projectedTomorrowOpening: number
  remainingRatio: number
  remainingToday: number
  status: DailyBudgetStatus
  theme: AppTheme
  visibleProgress: number
}): DailyBudgetRingViewModel {
  const chartSize = compact ? 214 : 276
  const radius = compact ? 75 : 98
  const innerRadius = compact ? 54 : 70
  const ringWidth = compact ? 18 : 23
  const overrunRatio =
    openingBudget > 0 ? clamp(Math.abs(remainingToday) / Math.max(openingBudget, 1)) : 0
  const palette = getDailyBudgetStatusPalette(theme, status)

  return {
    centerLabel: status === 'exceeded' ? 'Pasado hoy' : 'Disponible hoy',
    chartSize,
    footnote: compact
      ? `Mañana ${currencyFormatter.format(projectedTomorrowOpening)}`
      : `Mañana abrirías con ${currencyFormatter.format(projectedTomorrowOpening)}`,
    innerRadius,
    mainProgress: status === 'exceeded' ? 1 : remainingRatio * visibleProgress,
    overrunProgress: status === 'exceeded' ? overrunRatio * visibleProgress : 0,
    palette,
    radius,
    ringWidth,
  }
}
