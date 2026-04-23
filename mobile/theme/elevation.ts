import type { ViewStyle } from 'react-native'
import type { AppTheme } from '@/theme/palette'

export type ElevationVariant =
  | 'card'
  | 'cardElevated'
  | 'panel'
  | 'panelHero'
  | 'floatingNav'
  | 'segmentedActive'

/**
 * Builds a cross-platform drop-shadow style using the `boxShadow` CSS-style
 * property (supported in React Native 0.76+ and react-native-web 0.21+,
 * replacing the deprecated `shadow*` props). Android also gets an
 * `elevation` value for its native shadow compositor.
 */
function shadowStyle(
  color: string,
  offsetY: number,
  blur: number,
  opacity: number,
  elevation: number,
): ViewStyle {
  return {
    boxShadow: `0px ${offsetY}px ${blur}px ${withAlpha(color, opacity)}`,
    elevation,
  }
}

function withAlpha(hex: string, alpha: number): string {
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

export function buildElevationStyle(
  theme: AppTheme,
  variant: ElevationVariant,
): ViewStyle {
  switch (variant) {
    case 'cardElevated':
      return shadowStyle('#000000', 16, 24, theme.isDark ? 0.26 : 0.09, 9)
    case 'panel':
      return theme.isDark ? {} : shadowStyle('#4E685A', 12, 20, 0.08, 6)
    case 'panelHero':
      return theme.isDark ? {} : shadowStyle('#5F8A70', 18, 28, 0.12, 10)
    case 'floatingNav':
      return shadowStyle(
        theme.isDark ? '#000000' : '#526F5F',
        22,
        30,
        theme.isDark ? 0.32 : 0.12,
        16,
      )
    case 'segmentedActive':
      return shadowStyle('#000000', 2, 6, 0.08, 1)
    default:
      return shadowStyle('#000000', 10, 16, theme.isDark ? 0.14 : 0.04, 3)
  }
}

export function buildFloatingTabBarStyle(theme: AppTheme): ViewStyle {
  return {
    position: 'absolute',
    left: 18,
    right: 18,
    bottom: 14,
    height: 88,
    paddingTop: 10,
    paddingBottom: 14,
    paddingHorizontal: 6,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: theme.isDark ? 'rgba(125, 222, 160, 0.14)' : 'rgba(17, 17, 17, 0.08)',
    borderRadius: 32,
    overflow: 'visible',
    ...buildElevationStyle(theme, 'floatingNav'),
  }
}
