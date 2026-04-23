import type { AppTheme } from '@/theme/palette'
import { withAlpha } from '@/theme/color-utils'

export interface ScreenHeaderPalette {
  buttonBackgroundColor: string
  buttonBorderColor: string
  iconColor: string
  titleColor: string
}

export function buildScreenHeaderPalette(theme: AppTheme): ScreenHeaderPalette {
  if (theme.isDark) {
    return {
      buttonBackgroundColor: withAlpha(theme.colors.surfaceStrong, 0.92),
      buttonBorderColor: withAlpha(theme.colors.text, 0.08),
      iconColor: theme.colors.text,
      titleColor: theme.colors.text,
    }
  }

  return {
    buttonBackgroundColor: withAlpha(theme.colors.backgroundElevated, 0.94),
    buttonBorderColor: withAlpha(theme.colors.text, 0.08),
    iconColor: theme.colors.text,
    titleColor: theme.colors.text,
  }
}
