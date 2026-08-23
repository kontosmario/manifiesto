import type { ViewStyle } from 'react-native'
import type { AppTheme } from '@/theme/palette'
import { applyPaintTier } from '@/theme/paint-tier'

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
 * replacing the deprecated `shadow*` props). With minSdk 29 the outset
 * `boxShadow` renders natively on Android too, so we deliberately do NOT
 * emit `elevation` alongside it: Android draws both paths independently
 * and the result was a doubled shadow (native outline shadow + box-shadow
 * drawable) that iOS never showed.
 */
function shadowStyle(
  color: string,
  offsetY: number,
  blur: number,
  opacity: number,
): ViewStyle {
  return applyPaintTier({
    boxShadow: `0px ${offsetY}px ${blur}px ${withAlpha(color, opacity)}`,
  })
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
      return shadowStyle('#000000', 16, 24, theme.isDark ? 0.26 : 0.09)
    case 'panel':
      return theme.isDark ? {} : shadowStyle('#4E685A', 12, 20, 0.08)
    case 'panelHero':
      return theme.isDark ? {} : shadowStyle('#5F8A70', 18, 28, 0.12)
    case 'floatingNav':
      return shadowStyle(
        theme.isDark ? '#000000' : '#526F5F',
        22,
        30,
        theme.isDark ? 0.32 : 0.12,
      )
    case 'segmentedActive':
      return shadowStyle('#000000', 2, 6, 0.08)
    default:
      return shadowStyle('#000000', 10, 16, theme.isDark ? 0.14 : 0.04)
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
