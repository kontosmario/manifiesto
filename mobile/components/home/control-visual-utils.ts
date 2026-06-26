import { withAlpha } from '@/theme/color-utils'
import type { AppTheme } from '@/theme/palette'
import { getNumberFormat } from '@/lib/i18n/active-locale'

export type SignalTone = 'default' | 'success' | 'warning'
export type VisualTone = 'primary' | 'success' | 'warning'

export interface SignalPalette {
  accentColor: string
  backgroundColor: string
  borderColor: string
  iconBackgroundColor: string
}

const compactMoneyOptions: Intl.NumberFormatOptions = {
  maximumFractionDigits: 1,
  minimumFractionDigits: 0,
}

export function clamp(value: number, min = 0, max = 1) {
  return Math.max(min, Math.min(value, max))
}

export function getSignalPalette(
  theme: AppTheme,
  tone: SignalTone,
): SignalPalette {
  const accentColor =
    tone === 'success'
      ? theme.colors.success
      : tone === 'warning'
        ? theme.colors.warning
        : theme.colors.primary

  if (theme.isDark) {
    return {
      accentColor,
      backgroundColor:
        tone === 'success'
          ? withAlpha(theme.colors.success, 0.1)
          : tone === 'warning'
            ? withAlpha(theme.colors.warning, 0.12)
            : withAlpha(theme.colors.text, 0.08),
      borderColor:
        tone === 'success'
          ? withAlpha(theme.colors.success, 0.18)
          : tone === 'warning'
            ? withAlpha(theme.colors.warning, 0.22)
            : withAlpha(theme.colors.text, 0.1),
      iconBackgroundColor:
        tone === 'success'
          ? withAlpha(theme.colors.success, 0.16)
          : tone === 'warning'
            ? withAlpha(theme.colors.warning, 0.18)
            : withAlpha(theme.colors.primary, 0.14),
    }
  }

  return {
    accentColor,
    backgroundColor:
      tone === 'success'
        ? withAlpha(theme.colors.success, 0.08)
        : tone === 'warning'
          ? withAlpha(theme.colors.warning, 0.1)
          : withAlpha(theme.colors.backgroundElevated, 0.96),
    borderColor:
      tone === 'success'
        ? withAlpha(theme.colors.success, 0.14)
        : tone === 'warning'
          ? withAlpha(theme.colors.warning, 0.18)
          : withAlpha(theme.colors.text, 0.08),
    iconBackgroundColor:
      tone === 'success'
        ? withAlpha(theme.colors.success, 0.12)
        : tone === 'warning'
          ? withAlpha(theme.colors.warning, 0.12)
          : withAlpha(theme.colors.primary, 0.1),
  }
}

export function formatCompactMoney(value: number) {
  const absoluteValue = Math.abs(value)
  const prefix = value < 0 ? '-$' : '$'
  const compactMoneyFormatter = getNumberFormat(compactMoneyOptions)

  if (absoluteValue >= 1_000_000) {
    return `${prefix}${compactMoneyFormatter.format(absoluteValue / 1_000_000)}M`
  }

  if (absoluteValue >= 1_000) {
    return `${prefix}${compactMoneyFormatter.format(absoluteValue / 1_000)}k`
  }

  return `${prefix}${compactMoneyFormatter.format(absoluteValue)}`
}
