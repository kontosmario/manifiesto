import { withAlpha } from '@/theme/color-utils'
import type { AppTheme } from '@/theme/palette'

export interface FinancialSummarySegmentTheme {
  available: string
  core: string
  fixed: string
  panel: string
  ringTrack: string
  savings: string
  spent: string
}

export interface FinancialSummaryUiPalette {
  chartHalo: string | null
  compactLegendBackground: string
  compactLegendBorder: (segmentColor: string) => string
  compactLegendIcon: string
  centerHighlightLight: string
  floatingLabelIcon: string
  legendIconForeground: string
  legendPanelBackground: string
  legendPanelBorder: string
  segmentBadgeBackground: string
}

export function buildFinancialSummarySegmentTheme({
  availableColor,
  fixedColor,
  isDailyVariant,
  savingsColor,
  spentColor,
  theme,
}: {
  availableColor?: string
  fixedColor?: string
  isDailyVariant: boolean
  savingsColor?: string
  spentColor?: string
  theme: AppTheme
}): FinancialSummarySegmentTheme {
  return {
    available: availableColor ?? (theme.isDark ? '#6DB6DA' : '#4F9DCC'),
    core: isDailyVariant
      ? theme.isDark
        ? withAlpha(theme.colors.background, 0.985)
        : withAlpha(theme.colors.backgroundElevated, 0.96)
      : theme.isDark
        ? withAlpha(theme.colors.background, 0.98)
        : withAlpha(theme.colors.backgroundElevated, 0.98),
    fixed: fixedColor ?? (theme.isDark ? '#D88294' : '#D96D86'),
    panel: isDailyVariant
      ? theme.isDark
        ? withAlpha(theme.colors.surfaceMuted, 0.74)
        : withAlpha(theme.colors.primarySurface, 0.88)
      : theme.isDark
        ? withAlpha(theme.colors.surfaceMuted, 0.7)
        : withAlpha(theme.colors.primarySurface, 0.82),
    ringTrack: isDailyVariant
      ? theme.isDark
        ? withAlpha(theme.colors.text, 0.08)
        : withAlpha(theme.colors.primary, 0.12)
      : theme.isDark
        ? withAlpha(theme.colors.text, 0.06)
        : withAlpha(theme.colors.primary, 0.09),
    savings: savingsColor ?? (theme.isDark ? '#74C87A' : '#5EBB67'),
    spent: spentColor ?? (theme.isDark ? '#D2A35B' : '#D89B43'),
  }
}

export function buildFinancialSummaryUiPalette(
  theme: AppTheme,
  isDailyVariant: boolean,
): FinancialSummaryUiPalette {
  return {
    chartHalo: theme.isDark
      ? null
      : isDailyVariant
        ? withAlpha(theme.colors.primary, 0.035)
        : withAlpha(theme.colors.primary, 0.05),
    compactLegendBackground: isDailyVariant
      ? theme.isDark
        ? withAlpha(theme.colors.background, 0.34)
        : withAlpha(theme.colors.backgroundElevated, 0.94)
      : theme.isDark
        ? withAlpha(theme.colors.background, 0.28)
        : withAlpha(theme.colors.backgroundElevated, 0.98),
    compactLegendBorder: (segmentColor) =>
      withAlpha(segmentColor, theme.isDark ? (isDailyVariant ? 0.25 : 0.2) : isDailyVariant ? 0.19 : 0.15),
    compactLegendIcon: theme.isDark ? withAlpha(theme.colors.text, 0.42) : theme.colors.textSoft,
    centerHighlightLight: theme.colors.backgroundElevated,
    floatingLabelIcon: theme.colors.backgroundElevated,
    legendIconForeground: theme.colors.background,
    legendPanelBackground: theme.isDark
      ? withAlpha(theme.colors.background, 0.44)
      : withAlpha(theme.colors.backgroundElevated, 0.98),
    legendPanelBorder: theme.isDark ? theme.colors.border : withAlpha(theme.colors.text, 0.06),
    segmentBadgeBackground: theme.isDark
      ? withAlpha(theme.colors.background, 0.84)
      : theme.colors.backgroundElevated,
  }
}
